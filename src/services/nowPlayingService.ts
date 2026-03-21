import { siteConfig } from '../config/site';
import { logger } from '../utils/logger';

export interface NowPlayingSong {
  title: string;
  artist: string;
  album: string;
  art: string;
}

export interface NowPlayingData {
  song: NowPlayingSong | null;
  isMusic: boolean;
}

const JINGLE_PATTERNS = [
  /^jingle/i,
  /^vinheta/i,
  /^id\s/i,
  /^spot/i,
  /^promo/i,
  /^interrup/i,
  /^bumper/i,
  /^sweeper/i,
  /^liner/i,
  /^station\s?id/i,
  /^hora\s?certa/i,
  /^cortina/i,
];

const JINGLE_PLAYLISTS = [
  /jingle/i,
  /vinheta/i,
  /interrup/i,
  /spot/i,
  /promo/i,
];

const MIN_SONG_DURATION = 60;
const POLL_INTERVAL = 8000;

function isValidSong(data: {
  title?: string;
  artist?: string;
  playlist?: string;
  duration?: number;
}): boolean {
  const { title, artist, playlist, duration } = data;

  if (!title || title.trim() === '') return false;
  if (!artist || artist.trim() === '' || artist.toLowerCase() === 'unknown') return false;
  if (duration && duration < MIN_SONG_DURATION) return false;
  if (JINGLE_PATTERNS.some((p) => p.test(title!))) return false;
  if (JINGLE_PATTERNS.some((p) => p.test(artist!))) return false;
  if (playlist && JINGLE_PLAYLISTS.some((p) => p.test(playlist))) return false;

  return true;
}

type NowPlayingListener = (data: NowPlayingData) => void;

class NowPlayingService {
  private listeners: NowPlayingListener[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private currentData: NowPlayingData = { song: null, isMusic: false };
  private lastSongKey: string | null = null;
  private apiUrl: string;

  constructor() {
    const url = new URL(siteConfig.radio.streamUrl);
    this.apiUrl = `${url.protocol}//${url.host}/api/nowplaying/olha_que_duas`;
  }

  start() {
    if (this.interval) return;

    this.fetchNowPlaying();
    this.interval = setInterval(() => this.fetchNowPlaying(), POLL_INTERVAL);
    logger.log('NowPlayingService started');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  subscribe(listener: NowPlayingListener): () => void {
    this.listeners.push(listener);
    // Emit current state immediately
    listener(this.currentData);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getCurrentData(): NowPlayingData {
    return this.currentData;
  }

  private emit(data: NowPlayingData) {
    this.currentData = data;
    this.listeners.forEach((l) => l(data));
  }

  private async fetchNowPlaying() {
    try {
      const response = await fetch(this.apiUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const nowPlaying = data.now_playing;

      if (nowPlaying?.song) {
        const songData = {
          title: nowPlaying.song.title || '',
          artist: nowPlaying.song.artist || '',
          playlist: nowPlaying.playlist || '',
          duration: nowPlaying.duration || 0,
        };

        const isMusic = isValidSong(songData);
        const songKey = `${songData.title}-${songData.artist}`;

        if (isMusic) {
          const songChanged = this.lastSongKey !== songKey;
          this.lastSongKey = songKey;

          const newData: NowPlayingData = {
            song: {
              title: songData.title,
              artist: songData.artist,
              album: nowPlaying.song.album || '',
              art: nowPlaying.song.art || '',
            },
            isMusic: true,
          };

          if (songChanged || !this.currentData.isMusic) {
            this.emit(newData);
          }
        } else {
          this.lastSongKey = null;
          this.emit({ song: null, isMusic: false });
        }
      } else {
        this.lastSongKey = null;
        this.emit({ song: null, isMusic: false });
      }
    } catch (error) {
      logger.error('NowPlaying fetch error:', error);
    }
  }
}

export const nowPlayingService = new NowPlayingService();
