/*
  Lightweight wrapper around the Web Speech API (SpeechRecognition)
  Provides start/pause/resume/stop controls and exposes interim/final results
*/

export interface WebSpeechCallbacks {
  onInterim?: (text: string) => void;
  onFinal?: (text: string, confidence: number) => void;
  onError?: (err: string) => void;
  onStatusChange?: (status: 'listening' | 'paused' | 'stopped' | 'error') => void;
}

export class WebSpeechTranscriber {
  private recognition: SpeechRecognition | null = null;
  private callbacks: WebSpeechCallbacks;
  private listening = false;
  private paused = false;

  constructor(callbacks: WebSpeechCallbacks) {
    this.callbacks = callbacks;
    type SpeechRecognitionConstructor = new () => SpeechRecognition;
    const SpeechRecognitionCtor: SpeechRecognitionConstructor | null =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
    if (!SpeechRecognitionCtor) {
      callbacks.onError?.('Web Speech API is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    this.recognition = new SpeechRecognitionCtor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.listening = true;
      this.callbacks.onStatusChange?.('listening');
    };

    this.recognition.onerror = (event) => {
      const message = event.error || 'unknown_error';
      this.callbacks.onError?.(message);
      this.callbacks.onStatusChange?.('error');
    };

    this.recognition.onend = () => {
      // When not paused and still listening, automatically restart to maintain continuous stream
      if (this.listening && !this.paused) {
        try {
          this.recognition?.start();
        } catch (e) {
          console.log(e);
          // ignore rapid restarts
        }
      } else {
        this.callbacks.onStatusChange?.('stopped');
      }
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0].transcript.trim();
        const confidence = res[0].confidence ?? 0.75; // WebSpeech returns 0..1
      
        if (res.isFinal) {
          this.callbacks.onFinal?.(transcript, confidence);
        } else {
          this.callbacks.onInterim?.(transcript);
        }
      }
    };
  }

  start() {
    if (!this.recognition) return;
    if (this.listening) return;
    this.paused = false;
    try {
      this.recognition.start();
    } catch (e) {
      console.log(e);
      
      // browsers may throw if called too quickly
    }
  }

  pause() {
    if (!this.recognition) return;
    this.paused = true;
    try {
      this.recognition.stop();
      this.callbacks.onStatusChange?.('paused');
    } catch (e) {
      console.log(e);
      
    }
  }

  resume() {
    if (!this.recognition) return;
    this.paused = false;
    try {
      this.recognition.start();
      this.callbacks.onStatusChange?.('listening');
    } catch (e) {
      console.log(e);
      
    }
  }

  stop() {
    if (!this.recognition) return;
    this.listening = false;
    this.paused = false;
    try {
      this.recognition.stop();
      this.callbacks.onStatusChange?.('stopped');
    } catch (e) {
      console.log(e);
      
    }
  }
}