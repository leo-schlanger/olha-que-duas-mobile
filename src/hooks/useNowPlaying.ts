import { useState, useEffect, useRef } from 'react';
import { nowPlayingService, NowPlayingData, NowPlayingSong } from '../services/nowPlayingService';

interface NowPlayingState {
  song: NowPlayingSong | null;
  isMusic: boolean;
  isTransition: boolean;
}

const TRANSITION_DURATION = 2000;

export function useNowPlaying(isPlaying: boolean) {
  const [state, setState] = useState<NowPlayingState>({
    song: null,
    isMusic: false,
    isTransition: false,
  });

  const lastSongKeyRef = useRef<string | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isPlaying) {
      nowPlayingService.start();
    } else {
      nowPlayingService.stop();
      setState({ song: null, isMusic: false, isTransition: false });
      lastSongKeyRef.current = null;
      return;
    }

    const unsubscribe = nowPlayingService.subscribe((data: NowPlayingData) => {
      if (!data.isMusic || !data.song) {
        setState((prev) => (prev.isTransition ? prev : { song: null, isMusic: false, isTransition: false }));
        return;
      }

      const songKey = `${data.song.title}-${data.song.artist}`;
      const songChanged = lastSongKeyRef.current !== null && lastSongKeyRef.current !== songKey;

      if (songChanged) {
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
        }

        setState((prev) => ({ ...prev, isTransition: true }));

        transitionTimeoutRef.current = setTimeout(() => {
          setState({
            song: data.song,
            isMusic: true,
            isTransition: false,
          });
        }, TRANSITION_DURATION);

        lastSongKeyRef.current = songKey;
        return;
      }

      lastSongKeyRef.current = songKey;
      setState((prev) => {
        if (prev.isTransition) return prev;
        return { song: data.song, isMusic: true, isTransition: false };
      });
    });

    return () => {
      unsubscribe();
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, [isPlaying]);

  return state;
}
