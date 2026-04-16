import { useState, useEffect } from 'react';
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
    return () => {
      unsubscribe();
    };
  }, [isPlaying]);

  return data;
}
