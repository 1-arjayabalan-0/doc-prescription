export type SpeakerLabel = 'Doctor' | 'Patient' | 'Unknown';

export interface TranscriptUtterance {
  id: string;
  speaker: SpeakerLabel;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number; // 0..1
}

export interface TranscriptSessionMeta {
  id: string;
  provider: 'WebSpeech' | 'External';
  startTimeIso: string;
  endTimeIso?: string;
  durationMs?: number;
  status: 'idle' | 'listening' | 'paused' | 'stopped' | 'error';
}

export interface TranscriptJSONOutput {
  session: TranscriptSessionMeta;
  utterances: TranscriptUtterance[];
  overallConfidence?: number; // average of utterances
  diarization: {
    mode: 'auto' | 'manual' | 'unknown';
    speakers: SpeakerLabel[];
  };
  errors?: string[];
}