import type { AudioMeterCallbacks, AudioMeterOptions } from "../types/audio-meter-type";


export class AudioMeter {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private callbacks: AudioMeterCallbacks;
  private options: Required<AudioMeterOptions>;
  private silenceTimer: number | null = null;
  private isSilent: boolean = false;
  private lastLevel: number = 0;
  private smoothedLevel: number = 0;
  private smoothingFactor: number = 0.8; // Additional smoothing for UI

  constructor(callbacks: AudioMeterCallbacks, options: AudioMeterOptions = {}) {
    this.callbacks = callbacks;
    this.options = {
      fftSize: options.fftSize || 2048,
      smoothingTimeConstant: options.smoothingTimeConstant || 0.5,
      silenceThreshold: options.silenceThreshold || 0.05,
      silenceTimeout: options.silenceTimeout || 1500,
    };
  }

  start(stream: MediaStream) {
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.source = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      
      // Configure analyser for better performance
      this.analyser.fftSize = this.options.fftSize;
      this.analyser.smoothingTimeConstant = this.options.smoothingTimeConstant;
      
      this.source.connect(this.analyser);

      // Use frequency data for more accurate level detection
      const frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      const timeData = new Uint8Array(this.analyser.frequencyBinCount);
      
      const loop = () => {
        if (!this.analyser) return;
        
        // Get both time and frequency domain data for better analysis
        this.analyser.getByteFrequencyData(frequencyData);
        this.analyser.getByteTimeDomainData(timeData);
        
        // Compute RMS from time domain data
        let sumTime = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = (timeData[i] - 128) / 128; // -1..1
          sumTime += v * v;
        }
        const rmsTime = Math.sqrt(sumTime / timeData.length);
        
        // Compute average from frequency data
        const avgFreq = frequencyData.reduce((sum, value) => sum + value, 0) / frequencyData.length / 255;
        
        // Combine both metrics with emphasis on frequency data for better sensitivity
        const combinedLevel = (avgFreq * 0.7) + (rmsTime * 0.3);
        const level = Math.min(1, Math.max(0, combinedLevel));
        
        // Apply additional smoothing for UI
        this.smoothedLevel = (this.smoothingFactor * this.smoothedLevel) + ((1 - this.smoothingFactor) * level);
        this.lastLevel = this.smoothedLevel;
        
        // Detect silence
        this.checkSilence(this.smoothedLevel);
        
        this.callbacks.onLevel?.(this.smoothedLevel);
        this.rafId = requestAnimationFrame(loop);
      };
      
      loop();
    } catch (e: any) {
      this.callbacks.onError?.(e?.message || 'Audio meter error');
    }
  }

  private checkSilence(level: number) {
    if (level < this.options.silenceThreshold) {
      if (!this.isSilent && !this.silenceTimer) {
        this.silenceTimer = window.setTimeout(() => {
          this.isSilent = true;
          this.callbacks.onSilence?.(true);
          this.silenceTimer = null;
        }, this.options.silenceTimeout);
      }
    } else {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      if (this.isSilent) {
        this.isSilent = false;
        this.callbacks.onSilence?.(false);
      }
    }
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
      this.ctx?.close();
    } catch (e) {
      // Silent error handling
    } finally {
      this.source = null;
      this.analyser = null;
      this.ctx = null;
      this.isSilent = false;
      this.lastLevel = 0;
      this.smoothedLevel = 0;
    }
  }
}