import { useState, useEffect } from 'react';
import { AppState } from 'react-native';
import { nowPlayingService, NowPlayingData } from '../services/nowPlayingService';

const IDLE: NowPlayingData = {
  mode: 'idle',
  song: null,
  liveShowName: '',
  podcastName: '',
  podcastArt: '',
  announcementName: '',
  announcementArt: '',
  localArtUri: null,
  isMusic: false,
};

/**
 * Subscribes to the now-playing service and exposes the current classified
 * state. The service handles polling/SSE/transition timing internally — this
 * hook just mirrors its output and resets to idle when the player isn't on.
 */
export function useNowPlaying(isPlaying: boolean): NowPlayingData {
  const [data, setData] = useState<NowPlayingData>(IDLE);

  useEffect(() => {
    if (!isPlaying) {
      setData(IDLE);
      return undefined;
    }
    const unsubscribe = nowPlayingService.subscribe(setData);

    // When the app returns to foreground, React may not have flushed the
    // state updates that arrived while backgrounded. Force a fresh read
    // from the service with a new object reference so expo-image picks up
    // the latest artwork URI immediately.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const current = nowPlayingService.getCurrentData();
        setData({ ...current });
      }
    });

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, [isPlaying]);

  return data;
}
