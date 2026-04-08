import { useState, useEffect, useCallback } from 'react';
import { siteConfig } from '../config/site';
import { radioService, RadioStatus } from '../services/radioService';
import { logger } from '../utils/logger';

/**
 * Hook for managing radio playback state and controls
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
    let mounted = true;

    const init = async () => {
      try {
        await radioService.initialize();
        if (mounted) {
          radioService.setStatusCallback((s) => {
            if (mounted) setStatus(s);
          });
          setIsInitialized(true);
        }
      } catch (error) {
        logger.error('Failed to initialize radio:', error);
        if (mounted) setIsInitialized(true);
      }
    };

    init();

    return () => {
      mounted = false;
      radioService.setStatusCallback(() => {});
    };
  }, []);

  const togglePlayPause = useCallback(async () => {
    // Don't set loading here - let the service control the state
    await radioService.togglePlayPause();
  }, []);

  const play = useCallback(async () => {
    await radioService.play();
  }, []);

  const pause = useCallback(async () => {
    await radioService.pause();
  }, []);

  const stop = useCallback(async () => {
    await radioService.stop();
  }, []);

  const setVolume = useCallback(async (value: number) => {
    await radioService.setVolume(value);
  }, []);

  const forceReconnect = useCallback(async () => {
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
