import { useCallback, useEffect, useRef, useState } from "react";
import { AudioMeter } from "../services/AudioMeter";
import type {  AudioMeterOptions } from "../types/audio-meter-type";

interface AudioRecorderOptions {
  mimeType?: string;
  audioBitsPerSecond?: number;
  timeslice?: number;
  audioMeterOptions?: AudioMeterOptions;
  onError?: (error: Error) => void;
  onSilence?: (isSilent: boolean) => void;
  onDataAvailable?: (data: Blob) => void;
}

export const useAudioRecorder = (
  onStop: (audioBlob: Blob) => void,
  options: AudioRecorderOptions = {}
) => {
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [isSilent, setIsSilent] = useState(false);
  const [isPermissionGranted, setIsPermissionGranted] = useState<
    boolean | null
  >(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioMeterRef = useRef<AudioMeter | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, []);

  const cleanupResources = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audioMeterRef.current) {
      audioMeterRef.current.stop();
      audioMeterRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }

    mediaRecorderRef.current = null;
    audioChunks.current = [];
  }, []);

  const handleError = useCallback(
    (err: Error) => {
      setError(err);
      setIsListening(false);
      setIsPaused(false);
      cleanupResources();

      if (options.onError) {
        options.onError(err);
      }
    },
    [options, cleanupResources]
  );

  const checkPermission = useCallback(async (): Promise<boolean> => {
    try {
      // Check if permission was already granted
      const permissionStatus = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });

      if (permissionStatus.state === "granted") {
        setIsPermissionGranted(true);
        return true;
      } else if (permissionStatus.state === "denied") {
        setIsPermissionGranted(false);
        handleError(new Error("Microphone permission denied"));
        return false;
      }

      // If permission state is prompt, we need to request access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setIsPermissionGranted(true);
      return true;
    } catch (err) {
      setIsPermissionGranted(false);
      handleError(
        err instanceof Error
          ? err
          : new Error("Failed to check microphone permissions")
      );
      return false;
    }
  }, [handleError]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Check permissions first
      const hasPermission = await checkPermission();
      if (!hasPermission) return;

      // Clean up any existing resources
      cleanupResources();

      // Get audio stream with enhanced settings
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      streamRef.current = stream;

      // Setup audio meter for level monitoring
      audioMeterRef.current = new AudioMeter(
        {
          onLevel: setAudioLevel,
          onError: (err) => handleError(new Error(err)),
          onSilence: (silent) => {
            setIsSilent(silent);
            options.onSilence?.(silent);
          },
        },
        options.audioMeterOptions
      );

      audioMeterRef.current.start(stream);

      // Setup media recorder with options
      const recorderOptions: MediaRecorderOptions = {
        mimeType: options.mimeType || getSupportedMimeType(),
        audioBitsPerSecond: options.audioBitsPerSecond || 128000,
      };

      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;
      audioChunks.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
          options.onDataAvailable?.(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        handleError(new Error(`MediaRecorder error: ${event.error.message}`));
      };

      mediaRecorder.onstop = () => {
        try {
          if (audioChunks.current.length === 0) {
            handleError(new Error("No audio data recorded"));
            return;
          }

          const mimeType = mediaRecorder.mimeType || "audio/webm";
          const audioBlob = new Blob(audioChunks.current, { type: mimeType });
          onStop(audioBlob);
        } catch (err) {
          handleError(
            err instanceof Error
              ? err
              : new Error("Error processing recorded audio")
          );
        } finally {
          cleanupResources();
        }
      };

      // Start recording with timeslice if specified
      if (options.timeslice) {
        mediaRecorder.start(options.timeslice);
      } else {
        mediaRecorder.start();
      }

      setIsListening(true);
      setIsPaused(false);
    } catch (err) {
      handleError(
        err instanceof Error ? err : new Error("Failed to start recording")
      );
    }
  }, [onStop, options, handleError, checkPermission, cleanupResources]);

  const stopRecording = useCallback(() => {
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }

      setIsListening(false);
      setIsPaused(false);
    } catch (err) {
      handleError(
        err instanceof Error ? err : new Error("Failed to stop recording")
      );
    }
  }, [handleError]);

  const pauseRecording = useCallback(() => {
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      }
    } catch (err) {
      handleError(
        err instanceof Error ? err : new Error("Failed to pause recording")
      );
    }
  }, [handleError]);

  const resumeRecording = useCallback(() => {
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "paused"
      ) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      }
    } catch (err) {
      handleError(
        err instanceof Error ? err : new Error("Failed to resume recording")
      );
    }
  }, [handleError]);

  // Helper function to get supported mime type
  const getSupportedMimeType = (): string => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/mpeg",
      "", // Empty string is a valid fallback that lets the browser choose
    ];

    for (const type of types) {
      if (!type || MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return "";
  };

  return {
    isListening,
    isPaused,
    audioLevel,
    isSilent,
    error,
    isPermissionGranted,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  };
};
