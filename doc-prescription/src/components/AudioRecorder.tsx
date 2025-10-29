import { useEffect, useState } from "react";
import "../styles/AudioRecorder.css";
import type { SpeakerLabel } from "../types/transcription";

interface Props {
  isListening: boolean;
  isPaused: boolean;
  audioLevel: number; // 0..1
  interimText: string;
  utterances: any[];
  speakerMode: "auto" | "manual";
  currentSpeaker: SpeakerLabel;
  onSpeakerModeChange: (mode: "auto" | "manual") => void;
  onCurrentSpeakerChange: (speaker: SpeakerLabel) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  isUploading?: boolean;
  uploadProgress?: number;
  error?: Error | string | null;
  isSilent?: boolean;
  isPermissionGranted?: boolean | null;
}

const AudioRecorder = ({
  isListening,
  isPaused,
  audioLevel,
  interimText,
  utterances,
  speakerMode,
  currentSpeaker,
  onSpeakerModeChange,
  onCurrentSpeakerChange,
  onStart,
  onPause,
  onResume,
  onStop,
  isUploading = false,
  uploadProgress = 0,
  error = null,
  isSilent = false,
  isPermissionGranted = null,
}: Props) => {
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [animatedLevel, setAnimatedLevel] = useState(0);

  // Smooth animation for audio level
  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      setAnimatedLevel((prev) => {
        const diff = audioLevel - prev;
        return prev + diff * 0.3; // Smooth transition
      });
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [audioLevel, animatedLevel]);

  // Show permission prompt if needed
  useEffect(() => {
    if (isPermissionGranted === false) {
      setShowPermissionPrompt(true);
    }
  }, [isPermissionGranted]);

  const handleStartClick = () => {
    setShowPermissionPrompt(false);
    onStart();
  };

  const errorMessage = error
    ? typeof error === "string"
      ? error
      : error.message
    : null;

  return (
    <div
      className={`card audio-recorder ${isListening ? "recording" : ""} ${
        isPaused ? "paused" : ""
      }`}
    >
      <div className="card-header">
        <i className="fas fa-microphone"></i>
        <h2>Voice Recording</h2>
      </div>

      {/* Permission Prompt */}
      {showPermissionPrompt && (
        <div className="permission-prompt">
          <i className="fas fa-exclamation-triangle"></i>
          <p>Microphone access is required for recording.</p>
          <button className="permission-btn" onClick={handleStartClick}>
            Grant Permission
          </button>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="error-message">
          <i className="fas fa-exclamation-circle"></i>
          <p>{errorMessage}</p>
        </div>
      )}

      {/* Main Controls */}
      <div className="recorder-controls">
        {!isListening ? (
          <button
            className="mic-button pulse"
            onClick={handleStartClick}
            title="Start Listening"
            disabled={isUploading}
          >
            <i className="fas fa-microphone"></i>
            <span className="button-label">Start</span>
          </button>
        ) : (
          <button
            className={`mic-button recording ${isPaused ? "paused" : ""}`}
            onClick={onStop}
            title="Stop"
            disabled={isUploading}
          >
            <i className="fas fa-stop"></i>
            <span className="button-label">Stop</span>
          </button>
        )}
      </div>

      {/* Secondary Controls */}
      <div className="secondary-controls">
        <button
          className={`action-btn ${isPaused ? "inactive" : "active"}`}
          onClick={onPause}
          disabled={!isListening || isPaused || isUploading}
        >
          <i className="fas fa-pause"></i> Pause
        </button>
        <button
          className={`action-btn ${!isPaused ? "inactive" : "active"}`}
          onClick={onResume}
          disabled={!isListening || !isPaused || isUploading}
        >
          <i className="fas fa-play"></i> Continue
        </button>
      </div>

      {/* Status Indicator */}
      <div
        className={`voice-status ${isListening ? "recording" : ""} ${
          isPaused ? "paused" : ""
        } ${isSilent ? "silent" : ""}`}
      >
        {isListening ? (
          <>
            <i
              className={`fas ${
                isPaused
                  ? "fa-pause-circle"
                  : isSilent
                  ? "fa-volume-mute"
                  : "fa-circle"
              }`}
            ></i>
            <span>
              {isPaused
                ? "Paused"
                : isSilent
                ? "Silence Detected"
                : "Listening..."}
            </span>
          </>
        ) : isUploading ? (
          <>
            <i className="fas fa-cloud-upload-alt fa-pulse"></i>
            <span>Uploading... {uploadProgress}%</span>
          </>
        ) : (
          <>
            <i className="fas fa-microphone-alt"></i>
            <span>Click to Start Recording</span>
          </>
        )}
      </div>

      {/* Upload Progress Bar */}
      {isUploading && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              height: 8,
              width: "100%",
              background: "#e5e7eb",
              borderRadius: 4,
            }}
          >
            <div
              style={{
                width: `${uploadProgress}%`,
                height: "100%",
                background: "#3b82f6",
                borderRadius: 4,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <p
            style={{
              fontSize: "0.85rem",
              color: "#6b7280",
              textAlign: "center",
            }}
          >
            Uploading... {uploadProgress}%
          </p>
        </div>
      )}
      {error && <p style={{ color: 'red' }}>{JSON.stringify(error)}</p>}

      {/* Audio Level Meter */}
      <div className="audio-meter-container">
        <div className="audio-meter-background">
          <div
            className={`audio-meter-fill ${
              audioLevel > 0.75 ? "high" : audioLevel > 0.4 ? "medium" : "low"
            }`}
            style={{
              width: `${Math.round(animatedLevel * 100)}%`,
              transition: "width 100ms linear",
            }}
          />
        </div>
        <div className="audio-meter-label">
          {audioLevel < 0.05 && isListening && !isPaused
            ? "Low input volume detected - please speak closer to the mic"
            : "Audio level"}
        </div>
      </div>

      {/* Speaker Mode Controls */}
      <div className="speaker-controls">
        <div className="speaker-mode">
          <label>Speaker Mode:</label>
          <select
            value={speakerMode}
            onChange={(e) => onSpeakerModeChange(e.target.value as any)}
            disabled={isListening}
          >
            <option value="auto">Auto (alternate)</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        {speakerMode === "manual" && (
          <div className="speaker-selector">
            <label>Current Speaker:</label>
            <select
              value={currentSpeaker}
              onChange={(e) =>
                onCurrentSpeakerChange(e.target.value as SpeakerLabel)
              }
            >
              <option value="Doctor">Doctor</option>
              <option value="Patient">Patient</option>
            </select>
          </div>
        )}
      </div>

      {/* Live transcript */}
      <div className="transcript-container">
        <div className="transcript-header">Live Transcript</div>
        <div className="transcript-content">
          {utterances.length === 0 && !interimText && (
            <div className="transcript-empty">No speech captured yet...</div>
          )}
          {utterances.map((u) => (
            <div key={u.id} className="utterance">
              <span className="speaker">{u.speaker}:</span>
              <span className="text">{u.text}</span>
              <span className="meta">
                ({Math.round(u.confidence * 100)}%, {Math.round(u.endMs)}ms)
              </span>
            </div>
          ))}
          {interimText && (
            <div className="interim-text">
              <em>Interim:</em> {interimText}
            </div>
          )}
        </div>
      </div>

      <p className="voice-hint">
        {isListening
          ? "Speak clearly about patient symptoms, diagnosis, and treatment recommendations..."
          : "Click the microphone to start recording your patient consultation"}
      </p>
    </div>
  );
};

export default AudioRecorder;
