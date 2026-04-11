import { useState, useEffect } from 'react';
import { nowPlayingService, NowPlayingData, NowPlayingSong } from '../services/nowPlayingService';

interface NowPlayingState {
  song: NowPlayingSong | null;
  isMusic: boolean;
  /**
   * Kept for backwards compatibility with consumers that read this flag.
   * The new flow relies on expo-image's built-in cross-fade transition,
   * so the JSX no longer hides the song info during this window.
   */
  isTransition: boolean;
}

export function useNowPlaying(isPlaying: boolean) {
  const [state, setState] = useState<NowPlayingState>({
    song: null,
    isMusic: false,
    isTransition: false,
  });

  useEffect(() => {
    if (!isPlaying) {
      // Not playing — clear local state but don't stop the service
      // (radioService owns its lifecycle).
      setState({ song: null, isMusic: false, isTransition: false });
      return undefined;
    }

    // Apply the latest detected song straight away. Visual cross-fade is
    // handled by expo-image (its `transition` prop animates the art change),
    // and the text change is fast enough that no manual debounce is needed.
    // If the API returns a stream of identical updates, React's setState
    // shallow-compares state ref, so re-renders only happen on real changes.
    const unsubscribe = nowPlayingService.subscribe((data: NowPlayingData) => {
      if (!data.isMusic || !data.song) {
        setState((prev) =>
          prev.song === null && !prev.isMusic
            ? prev
            : { song: null, isMusic: false, isTransition: false }
        );
        return;
      }

      setState((prev) => {
        const sameSong =
          prev.song?.title === data.song?.title &&
          prev.song?.artist === data.song?.artist &&
          prev.song?.art === data.song?.art;
        if (sameSong && prev.isMusic) return prev;
        return { song: data.song, isMusic: true, isTransition: false };
      });
    });

    return () => {
      unsubscribe();
    };
  }, [isPlaying]);

  return state;
}
