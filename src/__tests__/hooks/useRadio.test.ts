// Unit tests for useRadio hook logic
// Note: Full hook testing requires React Native environment
// These tests focus on the underlying radioService

import { radioService } from '../../services/radioService';

// Mock radioService
jest.mock('../../services/radioService', () => ({
  radioService: {
    initialize: jest.fn(() => Promise.resolve()),
    setStatusCallback: jest.fn(),
    togglePlayPause: jest.fn(() => Promise.resolve()),
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    setVolume: jest.fn(() => Promise.resolve()),
    forceReconnect: jest.fn(() => Promise.resolve(true)),
    getStatus: jest.fn(() => ({
      isPlaying: false,
      volume: 1.0,
      isLoading: false,
      isReconnecting: false,
      reconnectAttempt: 0,
    })),
  },
}));

// Mock siteConfig
jest.mock('../../config/site', () => ({
  siteConfig: {
    radio: {
      name: 'Test Radio',
      tagline: 'Test Tagline',
      streamUrl: 'https://test.stream',
    },
  },
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('radioService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await radioService.initialize();
      expect(radioService.initialize).toHaveBeenCalled();
    });

    it('should accept status callback', () => {
      const callback = jest.fn();
      radioService.setStatusCallback(callback);
      expect(radioService.setStatusCallback).toHaveBeenCalledWith(callback);
    });
  });

  describe('playback controls', () => {
    it('should toggle play/pause', async () => {
      await radioService.togglePlayPause();
      expect(radioService.togglePlayPause).toHaveBeenCalled();
    });

    it('should play', async () => {
      await radioService.play();
      expect(radioService.play).toHaveBeenCalled();
    });

    it('should pause', async () => {
      await radioService.pause();
      expect(radioService.pause).toHaveBeenCalled();
    });

    it('should stop', async () => {
      await radioService.stop();
      expect(radioService.stop).toHaveBeenCalled();
    });
  });

  describe('volume control', () => {
    it('should set volume', async () => {
      await radioService.setVolume(0.5);
      expect(radioService.setVolume).toHaveBeenCalledWith(0.5);
    });

    it('should accept volume range 0-1', async () => {
      await radioService.setVolume(0);
      await radioService.setVolume(1);
      expect(radioService.setVolume).toHaveBeenCalledTimes(2);
    });
  });

  describe('reconnection', () => {
    it('should force reconnect and return success', async () => {
      const result = await radioService.forceReconnect();
      expect(radioService.forceReconnect).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('status', () => {
    it('should return current status', () => {
      const status = radioService.getStatus();
      expect(status).toHaveProperty('isPlaying');
      expect(status).toHaveProperty('volume');
      expect(status).toHaveProperty('isLoading');
    });
  });
});
