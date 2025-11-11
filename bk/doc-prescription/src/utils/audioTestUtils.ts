/**
 * Audio Testing Utilities
 * 
 * This module provides utilities for testing audio recording functionality
 * including mocks for MediaStream, AudioContext, and related Web Audio API components.
 */

/**
 * Creates a mock MediaStream for testing audio recording without requiring actual microphone access
 */
export const createMockMediaStream = (): MediaStream => {
  // Create mock audio track
  const mockTrack = {
    kind: 'audio',
    enabled: true,
    id: 'mock-audio-track-id',
    label: 'Mock Audio Track',
    muted: false,
    readyState: 'live',
    stop: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
    applyConstraints: jest.fn(),
    clone: jest.fn(() => ({ ...mockTrack })),
    getCapabilities: jest.fn(() => ({})),
    getConstraints: jest.fn(() => ({})),
    getSettings: jest.fn(() => ({})),
  } as unknown as MediaStreamTrack;

  // Create mock MediaStream
  const mockStream = {
    id: 'mock-media-stream-id',
    active: true,
    getTracks: jest.fn(() => [mockTrack]),
    getAudioTracks: jest.fn(() => [mockTrack]),
    getVideoTracks: jest.fn(() => []),
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
    clone: jest.fn(() => createMockMediaStream()),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
  } as unknown as MediaStream;

  return mockStream;
};

/**
 * Creates a mock AudioContext for testing audio processing without browser audio capabilities
 */
export const createMockAudioContext = () => {
  // Mock AnalyserNode
  const mockAnalyser = {
    fftSize: 2048,
    frequencyBinCount: 1024,
    minDecibels: -100,
    maxDecibels: -30,
    smoothingTimeConstant: 0.8,
    getFloatFrequencyData: jest.fn((array) => {
      // Fill with mock frequency data
      for (let i = 0; i < array.length; i++) {
        array[i] = -50 - Math.random() * 30;
      }
    }),
    getByteFrequencyData: jest.fn((array) => {
      // Fill with mock frequency data
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }),
    getFloatTimeDomainData: jest.fn((array) => {
      // Fill with mock waveform data
      for (let i = 0; i < array.length; i++) {
        array[i] = (Math.random() * 2) - 1; // Values between -1 and 1
      }
    }),
    getByteTimeDomainData: jest.fn((array) => {
      // Fill with mock waveform data
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(128 + (Math.random() * 128)); // Values between 0 and 255
      }
    }),
    connect: jest.fn(),
    disconnect: jest.fn(),
  };

  // Mock AudioContext
  const mockAudioContext = {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    createAnalyser: jest.fn(() => mockAnalyser),
    createMediaStreamSource: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
    })),
    close: jest.fn(),
    suspend: jest.fn(),
    resume: jest.fn(),
  };

  return mockAudioContext;
};

/**
 * Simulates audio level data for testing audio meter functionality
 * @param duration Duration of the simulation in milliseconds
 * @param callback Function to call with each audio level update
 * @param options Configuration options
 */
export const simulateAudioLevels = (
  duration: number,
  callback: (level: number) => void,
  options: {
    updateInterval?: number;
    minLevel?: number;
    maxLevel?: number;
    pattern?: 'random' | 'sine' | 'speech';
  } = {}
) => {
  const {
    updateInterval = 100,
    minLevel = 0.01,
    maxLevel = 0.8,
    pattern = 'random',
  } = options;

  let startTime = Date.now();
  let timerId: NodeJS.Timeout;
  
  const generateLevel = () => {
    const elapsed = Date.now() - startTime;
    const progress = elapsed / duration;
    
    let level: number;
    
    switch (pattern) {
      case 'sine':
        // Sine wave pattern
        level = minLevel + ((maxLevel - minLevel) * 
          (0.5 + 0.5 * Math.sin(progress * Math.PI * 10)));
        break;
      
      case 'speech':
        // Simulate speech patterns with bursts and pauses
        const isSpeaking = Math.random() > 0.3; // 70% chance of speaking
        if (isSpeaking) {
          level = minLevel + ((maxLevel - minLevel) * (0.4 + 0.6 * Math.random()));
        } else {
          level = minLevel * Math.random();
        }
        break;
      
      case 'random':
      default:
        // Random levels
        level = minLevel + ((maxLevel - minLevel) * Math.random());
        break;
    }
    
    return level;
  };
  
  const update = () => {
    const elapsed = Date.now() - startTime;
    
    if (elapsed >= duration) {
      clearInterval(timerId);
      return;
    }
    
    callback(generateLevel());
  };
  
  timerId = setInterval(update, updateInterval);
  
  // Return a function to stop the simulation early if needed
  return () => clearInterval(timerId);
};

/**
 * Creates a mock MediaRecorder for testing recording functionality
 */
export const createMockMediaRecorder = () => {
  let state: 'inactive' | 'recording' | 'paused' = 'inactive';
  let mimeType = 'audio/webm';
  let audioBitsPerSecond = 128000;
  let videoBitsPerSecond = 0;
  
  const eventListeners: Record<string, Function[]> = {
    start: [],
    stop: [],
    dataavailable: [],
    pause: [],
    resume: [],
    error: [],
  };
  
  const addEventListener = (event: string, callback: Function) => {
    if (eventListeners[event]) {
      eventListeners[event].push(callback);
    }
  };
  
  const removeEventListener = (event: string, callback: Function) => {
    if (eventListeners[event]) {
      const index = eventListeners[event].indexOf(callback);
      if (index !== -1) {
        eventListeners[event].splice(index, 1);
      }
    }
  };
  
  const dispatchEvent = (event: string, data?: any) => {
    if (eventListeners[event]) {
      const evt = { type: event, data };
      eventListeners[event].forEach(callback => callback(evt));
    }
  };
  
  return {
    start: jest.fn(() => {
      state = 'recording';
      dispatchEvent('start');
    }),
    stop: jest.fn(() => {
      state = 'inactive';
      // Create mock audio data
      const mockBlob = new Blob(['mock audio data'], { type: mimeType });
      dispatchEvent('dataavailable', mockBlob);
      dispatchEvent('stop');
    }),
    pause: jest.fn(() => {
      state = 'paused';
      dispatchEvent('pause');
    }),
    resume: jest.fn(() => {
      state = 'recording';
      dispatchEvent('resume');
    }),
    requestData: jest.fn(() => {
      const mockBlob = new Blob(['mock audio data'], { type: mimeType });
      dispatchEvent('dataavailable', mockBlob);
    }),
    addEventListener,
    removeEventListener,
    dispatchEvent,
    state,
    stream: createMockMediaStream(),
    mimeType,
    audioBitsPerSecond,
    videoBitsPerSecond,
  };
};

/**
 * Test utility to verify audio recording quality
 * @param audioBlob The recorded audio blob to analyze
 * @returns Promise resolving to quality metrics
 */
export const analyzeAudioQuality = async (audioBlob: Blob) => {
  // In a real implementation, this would analyze the audio data
  // For this mock, we'll return simulated metrics
  return {
    sampleRate: 44100,
    channels: 1,
    duration: 5.23, // seconds
    bitrate: 128000,
    noiseLevel: 0.02, // 0-1 scale
    clipping: 0.001, // percentage of samples that clip
    signalToNoiseRatio: 42.5, // dB
    quality: 'good', // 'poor', 'acceptable', 'good', 'excellent'
  };
};

/**
 * Mocks the navigator.mediaDevices.getUserMedia API for testing
 * @param shouldSucceed Whether the mock should succeed or fail
 * @param errorType Type of error to simulate if shouldSucceed is false
 */
export const mockGetUserMedia = (
  shouldSucceed = true,
  errorType: 'NotAllowedError' | 'NotFoundError' | 'AbortError' | 'NotReadableError' = 'NotAllowedError'
) => {
  const original = navigator.mediaDevices.getUserMedia;
  
  const mock = jest.fn(async (constraints) => {
    if (shouldSucceed) {
      return createMockMediaStream();
    } else {
      const errorMap = {
        NotAllowedError: 'Permission denied',
        NotFoundError: 'No audio device found',
        AbortError: 'Media request aborted',
        NotReadableError: 'Could not start audio source',
      };
      
      const error = new Error(errorMap[errorType]);
      error.name = errorType;
      throw error;
    }
  });
  
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
    writable: true,
    value: mock,
  });
  
  // Return a cleanup function to restore the original
  return () => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      writable: true,
      value: original,
    });
  };
};

/**
 * Creates a test harness for audio recording components
 */
export const createAudioTestHarness = () => {
  // Mock navigator.mediaDevices.getUserMedia
  const cleanupGetUserMedia = mockGetUserMedia(true);
  
  // Create mock audio context
  const mockAudioContext = createMockAudioContext();
  
  // Create mock media recorder
  const mockMediaRecorder = createMockMediaRecorder();
  
  // Mock window.AudioContext
  const originalAudioContext = window.AudioContext;
  window.AudioContext = jest.fn().mockImplementation(() => mockAudioContext) as any;
  
  // Mock window.MediaRecorder
  const originalMediaRecorder = window.MediaRecorder;
  window.MediaRecorder = jest.fn().mockImplementation(() => mockMediaRecorder) as any;
  
  // Return cleanup function
  return () => {
    cleanupGetUserMedia();
    window.AudioContext = originalAudioContext;
    window.MediaRecorder = originalMediaRecorder;
  };
};