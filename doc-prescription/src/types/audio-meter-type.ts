export interface AudioMeterCallbacks {
  onLevel?: (level: number) => void; // 0..1
  onError?: (err: string) => void;
  onSilence?: (isSilent: boolean) => void; // Callback for silence detection
}

export interface AudioMeterOptions {
  fftSize?: number;
  smoothingTimeConstant?: number;
  silenceThreshold?: number;
  silenceTimeout?: number;
}