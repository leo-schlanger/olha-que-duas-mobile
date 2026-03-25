import { useState, useEffect, useRef } from 'react';
import { nowPlayingService, NowPlayingData, NowPlayingSong } from '../services/nowPlayingService';

interface NowPlayingState {
  song: NowPlayingSong | null;
  isMusic: boolean;
  isTransition: boolean;
}

const TRANSITION_DURATION = 1500; // Reduzido para transições mais rápidas

export function useNowPlaying(isPlaying: boolean) {
  const [state, setState] = useState<NowPlayingState>({
    song: null,
    isMusic: false,
    isTransition: false,
  });

  const lastSongKeyRef = useRef<string | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSongRef = useRef<NowPlayingSong | null>(null); // Armazena a música pendente durante transição

  useEffect(() => {
    if (isPlaying) {
      nowPlayingService.start();
    } else {
      nowPlayingService.stop();
      setState({ song: null, isMusic: false, isTransition: false });
      lastSongKeyRef.current = null;
      pendingSongRef.current = null;
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
      return;
    }

    const unsubscribe = nowPlayingService.subscribe((data: NowPlayingData) => {
      if (!data.isMusic || !data.song) {
        // Se não é música, limpar transição e mostrar estado padrão
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
          transitionTimeoutRef.current = null;
        }
        pendingSongRef.current = null;
        setState((prev) => (prev.isTransition ? prev : { song: null, isMusic: false, isTransition: false }));
        return;
      }

      const songKey = `${data.song.title}-${data.song.artist}`;

      // Primeira música ou mesma música - sem transição
      if (lastSongKeyRef.current === null || lastSongKeyRef.current === songKey) {
        lastSongKeyRef.current = songKey;
        pendingSongRef.current = null;
        setState({ song: data.song, isMusic: true, isTransition: false });
        return;
      }

      // Música mudou - iniciar transição
      // Se já há uma transição em andamento, atualizar a música pendente
      pendingSongRef.current = data.song;
      lastSongKeyRef.current = songKey;

      // Só iniciar nova transição se não houver uma em andamento
      if (!transitionTimeoutRef.current) {
        setState((prev) => ({ ...prev, isTransition: true }));

        transitionTimeoutRef.current = setTimeout(() => {
          transitionTimeoutRef.current = null;
          // Usar a música mais recente (pendente) em vez da que iniciou a transição
          const finalSong = pendingSongRef.current || data.song;
          pendingSongRef.current = null;
          setState({
            song: finalSong,
            isMusic: true,
            isTransition: false,
          });
        }, TRANSITION_DURATION);
      }
    });

    return () => {
      unsubscribe();
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
      pendingSongRef.current = null;
    };
  }, [isPlaying]);

  return state;
}
