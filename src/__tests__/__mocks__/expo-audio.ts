// Mock for expo-audio
export const useAudioPlayer = jest.fn(() => ({
  play: jest.fn(),
  pause: jest.fn(),
  release: jest.fn(),
  playing: false,
  isBuffering: false,
  duration: 0,
  currentTime: 0,
}));
export const setAudioModeAsync = jest.fn();
export const AudioPlayer = jest.fn();
export const createAudioPlayer = jest.fn(() => ({
  play: jest.fn(),
  pause: jest.fn(),
  release: jest.fn(),
  playing: false,
  isBuffering: false,
  volume: 1,
  addListener: jest.fn(() => ({ remove: jest.fn() })),
}));
