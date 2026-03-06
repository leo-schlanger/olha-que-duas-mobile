import { useState, useEffect, useCallback } from 'react';
import { environment } from '../config/environment';
import { siteConfig } from '../config/site';

// Lazy load radio service (not available in Expo Go)
let radioService: any = null;
if (environment.canUseNativeModules) {
  try {
    radioService = require('../services/radioService').radioService;
  } catch (error) {
    console.log('Radio service not available');
  }
}

interface RadioStatus {
  isPlaying: boolean;
  volume: number;
  isLoading: boolean;
  isReconnecting?: boolean;
  reconnectAttempt?: number;
}

/**
 * Hook for managing radio playback state and controls
 * Handles initialization, play/pause, volume, and cleanup
 */
export function useRadio() {
  const [status, setStatus] = useState<RadioStatus>({
    isPlaying: false,
    volume: 1.0,
    isLoading: false,
    isReconnecting: false,
    reconnectAttempt: 0,
  });
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (radioService) {
        await radioService.initialize();
        radioService.setStatusCallback(setStatus);
        setIsInitialized(true);
      }
    };

    init();

    return () => {
      if (radioService) {
        radioService.setStatusCallback(() => {});
      }
    };
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!radioService) return;
    setStatus((prev) => ({ ...prev, isLoading: true }));
    await radioService.togglePlayPause();
  }, []);

  const play = useCallback(async () => {
    if (!radioService) return;
    setStatus((prev) => ({ ...prev, isLoading: true }));
    await radioService.play();
  }, []);

  const pause = useCallback(async () => {
    if (!radioService) return;
    await radioService.pause();
  }, []);

  const stop = useCallback(async () => {
    if (!radioService) return;
    await radioService.stop();
  }, []);

  const setVolume = useCallback(async (value: number) => {
    if (!radioService) return;
    await radioService.setVolume(value);
  }, []);

  const forceReconnect = useCallback(async () => {
    if (!radioService) return false;
    setStatus((prev) => ({ ...prev, isLoading: true }));
    return await radioService.forceReconnect();
  }, []);

  return {
    ...status,
    isInitialized,
    radioName: siteConfig.radio.name,
    radioTagline: siteConfig.radio.tagline,
    togglePlayPause,
    play,
    pause,
    stop,
    setVolume,
    forceReconnect,
  };
}
