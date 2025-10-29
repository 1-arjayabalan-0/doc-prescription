import { useEffect, useState } from "react";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useAudioUploader } from "../hooks/useAudioUploader";
import AudioRecorder from "./AudioRecorder";

interface RecordContainerProps {
  onTranscriptionComplete?: (transcription: string) => void;
}

const RecordContainer = ({ onTranscriptionComplete }: RecordContainerProps) => {
  const { uploadAudioToServer, uploadProgress, isUploading, error } = useAudioUploader();

  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState<Error | null>(null);

  // Create local state for properties not provided by useAudioRecorder
  const [interimText, setInterimText] = useState("");
  const [utterances, setUtterances] = useState<
    Array<{ speaker: string; text: string }>
  >([]);
  const [speakerMode, setSpeakerMode] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<any>("Doctor");

  // Only use properties that actually exist in useAudioRecorder
  const {
    isListening,
    isPaused,
    audioLevel,
    isSilent,
    isPermissionGranted,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = useAudioRecorder(
    (audioBlob) => {
      // Handle the audio blob when recording stops
      console.log("Recording stopped, audio blob received:", audioBlob);
    },
    {
      onSilence: (silent) => console.log("Silence detected:", silent),
      onError: (err) => console.error("Audio recorder error:", err),
    }
  );

  // Reset upload status when starting a new recording
  useEffect(() => {
    if (isListening) {
      setUploadStatus("idle");
      // setUploadProgress(0);
      setUploadError(null);
    }
  }, [isListening]);

  const handleStop = async () => {
    stopRecording();

    // Only attempt upload if we have utterances
    // if (utterances.length > 0) {
      try {
        setUploadStatus("uploading");

        // Simulate API upload with progress
        const audioBlob = await simulateAudioProcessing();
        await uploadAudioToServer(audioBlob);

        setUploadStatus("success");

        // Combine all utterances into a single transcription
        const fullTranscription = utterances
          .map((u) => `${u.speaker}: ${u.text}`)
          .join("\n");

        // Notify parent component
        onTranscriptionComplete?.(fullTranscription);
      } catch (err) {
        setUploadStatus("error");
        setUploadError(
          err instanceof Error ? err : new Error("Unknown upload error")
        );
        console.error("Upload failed:", err);
      }
    // }
  };

  // Simulate audio processing delay
  const simulateAudioProcessing = (): Promise<Blob> => {
    return new Promise((resolve) => {
      // Create a dummy audio blob (in a real app, this would be actual recorded audio)
      const dummyAudio = new Blob(["audio data"], { type: "audio/wav" });

      // Simulate processing delay
      setTimeout(() => {
        resolve(dummyAudio);
      }, 500);
    });
  };

  return (
    <div className="record-container">
      <AudioRecorder
        isListening={isListening}
        isPaused={isPaused}
        audioLevel={audioLevel}
        interimText={interimText}
        utterances={utterances}
        speakerMode={speakerMode ? "manual" : "auto"}
        currentSpeaker={currentSpeaker}
        onSpeakerModeChange={(mode) => setSpeakerMode(mode === "manual")}
        onCurrentSpeakerChange={setCurrentSpeaker}
        onStart={startRecording}
        onPause={pauseRecording}
        onResume={resumeRecording}
        onStop={handleStop}
        isUploading={uploadStatus === "uploading"}
        uploadProgress={uploadProgress}
        error={uploadError || error}
        isSilent={isSilent}
        isPermissionGranted={isPermissionGranted}
      />
    </div>
  );
};

export default RecordContainer;
