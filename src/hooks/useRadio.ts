import { useState, useEffect, useCallback } from 'react';
import { radioService, RadioStatus } from '../services/radioService';
import { siteConfig } from '../config/site';

/**
 * Hook for managing radio playback state and controls
 * Handles initialization, play/pause, volume, and cleanup
 */
export function useRadio() {
  const [status, setStatus] = useState<RadioStatus>({
    isPlaying: false,
    volume: 1.0,
    isLoading: false,
  });
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      await radioService.initialize();
      radioService.setStatusCallback(setStatus);
      setIsInitialized(true);
    };

    init();

    return () => {
      radioService.setStatusCallback(() => { });
    };
  }, []);

  const togglePlayPause = useCallback(async () => {
    setStatus(prev => ({ ...prev, isLoading: true }));
    await radioService.togglePlayPause();
  }, []);

  const play = useCallback(async () => {
    setStatus(prev => ({ ...prev, isLoading: true }));
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
  };
}
