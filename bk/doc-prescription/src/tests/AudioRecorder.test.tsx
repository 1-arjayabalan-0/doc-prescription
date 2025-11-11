import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AudioRecorder from '../components/AudioRecorder';
import { createAudioTestHarness, simulateAudioLevels } from '../utils/audioTestUtils';

describe('AudioRecorder Component', () => {
  // Setup and teardown for audio testing
  let cleanupAudioMocks: () => void;
  
  beforeEach(() => {
    cleanupAudioMocks = createAudioTestHarness();
  });
  
  afterEach(() => {
    cleanupAudioMocks();
  });
  
  // Test rendering
  test('renders with initial state correctly', () => {
    const mockProps = {
      isListening: false,
      isPaused: false,
      audioLevel: 0,
      interimText: '',
      utterances: [],
      speakerMode: 'auto' as const,
      currentSpeaker: 'Doctor' as const,
      onSpeakerModeChange: jest.fn(),
      onCurrentSpeakerChange: jest.fn(),
      onStart: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn(),
    };
    
    render(<AudioRecorder {...mockProps} />);
    
    // Check that the start button is visible
    expect(screen.getByText('Start')).toBeInTheDocument();
    
    // Check that the audio meter is rendered
    expect(screen.getByText('Audio level')).toBeInTheDocument();
  });
  
  // Test recording state
  test('shows correct UI when recording', () => {
    const mockProps = {
      isListening: true,
      isPaused: false,
      audioLevel: 0.5,
      interimText: 'Testing...',
      utterances: [],
      speakerMode: 'auto' as const,
      currentSpeaker: 'Doctor' as const,
      onSpeakerModeChange: jest.fn(),
      onCurrentSpeakerChange: jest.fn(),
      onStart: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn(),
    };
    
    render(<AudioRecorder {...mockProps} />);
    
    // Check that the stop button is visible
    expect(screen.getByText('Stop')).toBeInTheDocument();
    
    // Check that the listening status is shown
    expect(screen.getByText('Listening...')).toBeInTheDocument();
    
    // Check that interim text is displayed
    expect(screen.getByText(/Testing\.\.\./)).toBeInTheDocument();
  });
  
  // Test paused state
  test('shows correct UI when paused', () => {
    const mockProps = {
      isListening: true,
      isPaused: true,
      audioLevel: 0.2,
      interimText: '',
      utterances: [],
      speakerMode: 'auto' as const,
      currentSpeaker: 'Doctor' as const,
      onSpeakerModeChange: jest.fn(),
      onCurrentSpeakerChange: jest.fn(),
      onStart: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn(),
    };
    
    render(<AudioRecorder {...mockProps} />);
    
    // Check that the paused status is shown
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });
  
  // Test button interactions
  test('buttons trigger correct callbacks', () => {
    const mockProps = {
      isListening: false,
      isPaused: false,
      audioLevel: 0,
      interimText: '',
      utterances: [],
      speakerMode: 'auto' as const,
      currentSpeaker: 'Doctor' as const,
      onSpeakerModeChange: jest.fn(),
      onCurrentSpeakerChange: jest.fn(),
      onStart: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn(),
    };
    
    render(<AudioRecorder {...mockProps} />);
    
    // Click start button
    fireEvent.click(screen.getByText('Start'));
    expect(mockProps.onStart).toHaveBeenCalledTimes(1);
    
    // Update props to simulate recording state
    const recordingProps = {
      ...mockProps,
      isListening: true,
      onStart: jest.fn(),
    };
    
    render(<AudioRecorder {...recordingProps} />);
    
    // Click pause button
    fireEvent.click(screen.getByText('Pause'));
    expect(recordingProps.onPause).toHaveBeenCalledTimes(1);
    
    // Update props to simulate paused state
    const pausedProps = {
      ...recordingProps,
      isPaused: true,
      onPause: jest.fn(),
    };
    
    render(<AudioRecorder {...pausedProps} />);
    
    // Click resume button
    fireEvent.click(screen.getByText('Continue'));
    expect(pausedProps.onResume).toHaveBeenCalledTimes(1);
    
    // Click stop button
    fireEvent.click(screen.getByText('Stop'));
    expect(pausedProps.onStop).toHaveBeenCalledTimes(1);
  });
  
  // Test error display
  test('displays error message when provided', () => {
    const mockProps = {
      isListening: false,
      isPaused: false,
      audioLevel: 0,
      interimText: '',
      utterances: [],
      speakerMode: 'auto' as const,
      currentSpeaker: 'Doctor' as const,
      onSpeakerModeChange: jest.fn(),
      onCurrentSpeakerChange: jest.fn(),
      onStart: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn(),
      error: 'Microphone access denied',
    };
    
    render(<AudioRecorder {...mockProps} />);
    
    // Check that the error message is displayed
    expect(screen.getByText('Microphone access denied')).toBeInTheDocument();
  });
  
  // Test upload progress
  test('shows upload progress when uploading', () => {
    const mockProps = {
      isListening: false,
      isPaused: false,
      audioLevel: 0,
      interimText: '',
      utterances: [],
      speakerMode: 'auto' as const,
      currentSpeaker: 'Doctor' as const,
      onSpeakerModeChange: jest.fn(),
      onCurrentSpeakerChange: jest.fn(),
      onStart: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn(),
      isUploading: true,
      uploadProgress: 65,
    };
    
    render(<AudioRecorder {...mockProps} />);
    
    // Check that the upload progress is displayed
    expect(screen.getByText('65% Uploaded')).toBeInTheDocument();
  });
  
  // Test transcript display
  test('displays utterances correctly', () => {
    const mockProps = {
      isListening: true,
      isPaused: false,
      audioLevel: 0.3,
      interimText: '',
      utterances: [
        {
          id: 'utt_1',
          speaker: 'Doctor' as const,
          text: 'How are you feeling today?',
          startMs: 0,
          endMs: 2000,
          confidence: 0.95,
        },
        {
          id: 'utt_2',
          speaker: 'Patient' as const,
          text: 'I have had a headache for three days.',
          startMs: 2500,
          endMs: 5000,
          confidence: 0.88,
        },
      ],
      speakerMode: 'auto' as const,
      currentSpeaker: 'Doctor' as const,
      onSpeakerModeChange: jest.fn(),
      onCurrentSpeakerChange: jest.fn(),
      onStart: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn(),
    };
    
    render(<AudioRecorder {...mockProps} />);
    
    // Check that both utterances are displayed
    expect(screen.getByText(/How are you feeling today\?/)).toBeInTheDocument();
    expect(screen.getByText(/I have had a headache for three days\./)).toBeInTheDocument();
  });
});