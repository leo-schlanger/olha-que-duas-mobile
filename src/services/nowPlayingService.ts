import { AppState, AppStateStatus } from 'react-native';
import EventSource, { ErrorEvent, MessageEvent } from 'react-native-sse';
import { Image as ExpoImage } from 'expo-image';
import { siteConfig } from '../config/site';
import { logger } from '../utils/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { TIMING } from '../config/constants';

export interface NowPlayingSong {
  title: string;
  artist: string;
  album: string;
  art: string;
}

/**
 * What the radio is broadcasting right now, classified into one of five
 * mutually-exclusive modes. Mirrors the logic of the web app — see
 * `D:/Projetos/olha-que-duas/src/hooks/useNowPlaying.ts` (pickCategory) for
 * the reference implementation.
 */
export type NowPlayingMode = 'music' | 'liveShow' | 'podcast' | 'announcement' | 'idle';

export interface NowPlayingData {
  mode: NowPlayingMode;
  /** Populated only when mode === 'music' */
  song: NowPlayingSong | null;
  /** Populated only when mode === 'liveShow' */
  liveShowName: string;
  /** Populated only when mode === 'podcast' */
  podcastName: string;
  podcastArt: string;
  /** Populated only when mode === 'announcement' */
  announcementName: string;
  announcementArt: string;
  /** Legacy boolean kept for backwards compatibility — equals (mode === 'music') */
  isMusic: boolean;
}

export const IDLE_DATA: NowPlayingData = {
  mode: 'idle',
  song: null,
  liveShowName: '',
  podcastName: '',
  podcastArt: '',
  announcementName: '',
  announcementArt: '',
  isMusic: false,
};

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

const JINGLE_PLAYLISTS = [/jingle/i, /vinheta/i, /interrup/i, /spot/i, /promo/i];

// Playlists whose tracks are regular music programming (same list as the site).
const MUSIC_PLAYLIST_PATTERNS = [
  /mix/i,
  /rotation/i,
  /playlist/i,
  /morning/i,
  /afternoon/i,
  /sunset/i,
  /night/i,
  /madrugada/i,
  /noite/i,
  /tarde/i,
  /manh[ãa]/i,
  /top\s?\d/i,
  /hits/i,
  /chill/i,
  /lounge/i,
  /general/i,
  /default/i,
  /shuffle/i,
  /lunch/i,
  /beats/i,
  /break/i,
  /power/i,
  /hour/i,
  /midnight/i,
  /session/i,
  /relax/i,
  /flow/i,
  /wake/i,
  /especial/i,
  /infantil/i,
];

// Playlists dedicated to ads / sponsored spots / institutional content. They
// take PRIORITY over music (some ads have the artist filled in, e.g.
// "O Boticário") and have no minimum duration — the artwork is the message.
// No generic /especial/: "Especial do Dia" is a music rotation. The site adds
// "Especiais Infantil" via siteConfig.radio.announcementPlaylists.
const ANNOUNCEMENT_PLAYLIST_PATTERNS = [
  /an[uú]ncio/i,
  /destaqu/i,
  /aviso/i,
  /evento/i,
  /especiais infantil/i,
];

// Shortest track still treated as music (site: 25s — short legit songs exist).
const MIN_SONG_DURATION_SECONDS = 25;

// Without ICY, the listener hears what the server sent ~this many seconds ago
// (Icecast burst + decoder buffer).
const LISTENER_BUFFER_SECONDS = 5;

// An ICY title is trusted as "what is audible" for this long without changes
// (longest tracks/podcasts); after that we fall back to API timing.
const ICY_FRESH_MS = 15 * 60 * 1000;

// When the ICY title is not in the API payload yet, refetch after this delay
// (a few times) before falling back to API timing.
const ICY_REFETCH_DELAY_MS = 1500;
const ICY_MAX_REFETCHES = 4;

const SSE_RECONNECT_BASE_DELAY = 1000;
const SSE_RECONNECT_MAX_DELAY = 30000;

export interface AzuraEntry {
  played_at?: number;
  duration?: number;
  remaining?: number;
  playlist?: string;
  song?: { text?: string; title?: string; artist?: string; album?: string; art?: string };
}

export interface AzuraNowPlayingPayload {
  live?: { is_live?: boolean; streamer_name?: string };
  now_playing?: AzuraEntry;
  playing_next?: AzuraEntry;
  song_history?: AzuraEntry[];
}

interface CentrifugoFrame {
  connect?: unknown;
  channel?: string;
  pub?: { data?: { np?: AzuraNowPlayingPayload } };
}

function isJingleText(title: string, artist: string): boolean {
  return JINGLE_PATTERNS.some((p) => p.test(title) || p.test(artist));
}

export function isValidSong(data: {
  title?: string;
  artist?: string;
  playlist?: string;
  duration?: number;
}): boolean {
  const { title, artist, playlist, duration } = data;
  if (!title || title.trim() === '') return false;
  if (!artist || artist.trim() === '' || artist.toLowerCase() === 'unknown') return false;
  if (duration && duration < MIN_SONG_DURATION_SECONDS) return false;
  if (isJingleText(title, artist)) return false;
  if (playlist && JINGLE_PLAYLISTS.some((p) => p.test(playlist))) return false;
  return true;
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Texts an entry may appear as in the ICY StreamTitle. AzuraCast's `text`
 * can include the album ("Marisa Liz - Relatos… - Vício Difícil") while the
 * stream sends "Artist - Title", so both forms are accepted.
 */
function entryTexts(entry: AzuraEntry): string[] {
  const song = entry.song;
  if (!song) return [];
  const texts: string[] = [];
  if (song.text && song.text.trim()) texts.push(normalizeText(song.text));
  const title = song.title ?? '';
  texts.push(normalizeText(song.artist ? `${song.artist} - ${title}` : title));
  return texts.filter(Boolean);
}

/** Entry (now_playing, playing_next or history) whose text equals the ICY title. */
export function findEntryByStreamTitle(
  payload: AzuraNowPlayingPayload,
  streamTitle: string
): AzuraEntry | undefined {
  const wanted = normalizeText(streamTitle);
  if (!wanted) return undefined;
  const candidates: AzuraEntry[] = [
    ...(payload.now_playing ? [payload.now_playing] : []),
    ...(payload.playing_next ? [payload.playing_next] : []),
    ...(Array.isArray(payload.song_history) ? payload.song_history : []),
  ];
  return candidates.find((e) => entryTexts(e).includes(wanted));
}

/**
 * Fallback without ICY: the entry whose [played_at, played_at+duration)
 * window contains the listener wall-clock (server time minus the buffer).
 */
export function pickAudibleEntry(
  nowPlaying: AzuraEntry | undefined,
  history: AzuraEntry[],
  nowEpoch: number
): AzuraEntry | undefined {
  if (!nowPlaying) return undefined;
  const listenerWallClock = nowEpoch - LISTENER_BUFFER_SECONDS;
  for (const entry of [nowPlaying, ...history]) {
    const playedAt = entry.played_at;
    const duration = entry.duration;
    if (typeof playedAt !== 'number' || typeof duration !== 'number' || duration <= 0) continue;
    if (playedAt <= listenerWallClock && listenerWallClock < playedAt + duration) {
      return entry;
    }
  }
  return undefined;
}

/**
 * Classify what is audible. Same precedence as the site's pickCategory:
 * live > gap > jingle > announcement > music > (music playlist, incomplete
 * metadata) > podcast > jingle. Jingles and gaps show the station identity.
 */
export function classifyEntry(
  payload: AzuraNowPlayingPayload,
  audible: AzuraEntry | undefined
): NowPlayingData {
  if (payload.live?.is_live) {
    return {
      ...IDLE_DATA,
      mode: 'liveShow',
      liveShowName: payload.live.streamer_name?.trim() || '',
    };
  }
  if (!audible?.song) return IDLE_DATA;

  const title = audible.song.title || '';
  const artist = audible.song.artist || '';
  const playlist = audible.playlist || '';
  const duration = audible.duration || 0;
  const art = audible.song.art || '';

  const isJingle =
    isJingleText(title, artist) || (!!playlist && JINGLE_PLAYLISTS.some((p) => p.test(playlist)));
  if (isJingle) return IDLE_DATA;

  if (playlist && ANNOUNCEMENT_PLAYLIST_PATTERNS.some((p) => p.test(playlist))) {
    return {
      ...IDLE_DATA,
      mode: 'announcement',
      announcementName: title || playlist,
      announcementArt: art,
    };
  }

  const music = (songArtist: string): NowPlayingData => ({
    ...IDLE_DATA,
    mode: 'music',
    isMusic: true,
    song: { title, artist: songArtist, album: audible.song?.album || '', art },
  });

  if (isValidSong({ title, artist, playlist, duration })) return music(artist);

  const isMusicPlaylist = !playlist || MUSIC_PLAYLIST_PATTERNS.some((p) => p.test(playlist));
  if (isMusicPlaylist && title.trim() && duration >= MIN_SONG_DURATION_SECONDS) {
    return music(artist);
  }
  if (!isMusicPlaylist && duration >= MIN_SONG_DURATION_SECONDS) {
    return { ...IDLE_DATA, mode: 'podcast', podcastName: playlist, podcastArt: art };
  }
  return IDLE_DATA;
}

function artOf(data: NowPlayingData): string {
  if (data.mode === 'music') return data.song?.art || '';
  if (data.mode === 'podcast') return data.podcastArt;
  if (data.mode === 'announcement') return data.announcementArt;
  return '';
}

function dataChanged(prev: NowPlayingData, next: NowPlayingData): boolean {
  if (prev.mode !== next.mode) return true;
  switch (next.mode) {
    case 'music':
      return (
        prev.song?.title !== next.song?.title ||
        prev.song?.artist !== next.song?.artist ||
        prev.song?.art !== next.song?.art
      );
    case 'liveShow':
      return prev.liveShowName !== next.liveShowName;
    case 'podcast':
      return prev.podcastName !== next.podcastName || prev.podcastArt !== next.podcastArt;
    case 'announcement':
      return (
        prev.announcementName !== next.announcementName ||
        prev.announcementArt !== next.announcementArt
      );
    case 'idle':
      return false;
  }
}

type NowPlayingListener = (_data: NowPlayingData) => void;

class NowPlayingService {
  private listeners: NowPlayingListener[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private currentData: NowPlayingData = IDLE_DATA;
  private pollingUrl: string;
  private sseUrl: string;
  private channel: string;
  private isInBackground = false;
  private isFetching = false;
  // A fetch was requested while another was in flight (e.g. ICY change) —
  // run one more as soon as the current one finishes.
  private refetchQueued = false;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private isStarted = false;

  // SSE state
  private eventSource: EventSource | null = null;
  private sseConnected = false;
  private sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sseReconnectDelay = SSE_RECONNECT_BASE_DELAY;

  private lastPayload: AzuraNowPlayingPayload | null = null;
  // Timestamp of the latest processed now_playing entry — used to reject
  // out-of-order responses (e.g., slow poll arriving after a faster SSE frame).
  private lastProcessedPlayedAt: number = 0;
  private smartReemitTimer: ReturnType<typeof setTimeout> | null = null;

  // ICY StreamTitle from the stream (via radioService ← native player): what
  // the listener hears right now, in sync with the audio.
  private streamTitle: string | null = null;
  private streamTitleAt = 0;
  private icyRefetches = 0;
  private icyRefetchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPrefetchedArt = '';

  constructor() {
    const url = new URL(siteConfig.radio.streamUrl);
    // streamUrl: https://<host>/listen/<shortcode>/radio.mp3 → extract shortcode
    const pathParts = url.pathname.split('/').filter(Boolean);
    const shortcode = pathParts[1] || 'olha_que_duas';
    const baseUrl = `${url.protocol}//${url.host}`;
    this.pollingUrl = `${baseUrl}/api/nowplaying/${shortcode}`;
    this.sseUrl = `${baseUrl}/api/live/nowplaying/sse`;
    this.channel = `station:${shortcode}`;
    this.setupAppStateListener();
  }

  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      const wasInBackground = this.isInBackground;
      this.isInBackground = state === 'background';
      if (!this.isStarted || wasInBackground === this.isInBackground) return;

      // JS timers are paused in background, so polling only matters again
      // when we come back: refresh right away and restore the cadence. The
      // notification is handled natively and doesn't depend on this.
      this.startPolling();
      if (!this.isInBackground) {
        this.fetchNowPlaying();
        if (!this.eventSource) this.connectSSE();
      }
    });
  }

  start() {
    if (this.isStarted) return;
    this.isStarted = true;

    this.fetchNowPlaying();
    this.startPolling();
    this.connectSSE();
    logger.log('NowPlayingService started');
  }

  stop() {
    this.isStarted = false;
    this.stopPolling();
    this.closeSSE();
    if (this.sseReconnectTimer) {
      clearTimeout(this.sseReconnectTimer);
      this.sseReconnectTimer = null;
    }
    this.clearSmartReemit();
    this.clearIcyRefetch();
    this.sseReconnectDelay = SSE_RECONNECT_BASE_DELAY;
    this.lastPayload = null;
    this.lastProcessedPlayedAt = 0;
    this.streamTitle = null;
    this.streamTitleAt = 0;
    this.icyRefetches = 0;
    this.currentData = IDLE_DATA;
  }

  cleanup() {
    this.stop();
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  subscribe(listener: NowPlayingListener): () => void {
    this.listeners.push(listener);
    listener(this.currentData);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getCurrentData(): NowPlayingData {
    return this.currentData;
  }

  /**
   * The stream's ICY title changed: the listener is hearing a new item NOW.
   * Resolve it against the last payload (playing_next is usually already
   * there, with its cover prefetched) and refresh the API right away.
   */
  onStreamTitle(title: string) {
    if (!this.isStarted || !title || title === this.streamTitle) return;
    this.streamTitle = title;
    this.streamTitleAt = Date.now();
    this.icyRefetches = 0;
    this.clearIcyRefetch();
    if (this.lastPayload) this.processPayload(this.lastPayload);
    this.fetchNowPlaying();
  }

  private icyIsFresh(): boolean {
    return this.streamTitle != null && Date.now() - this.streamTitleAt < ICY_FRESH_MS;
  }

  private clearIcyRefetch() {
    if (this.icyRefetchTimer) {
      clearTimeout(this.icyRefetchTimer);
      this.icyRefetchTimer = null;
    }
  }

  // ---------- Polling (fallback) ----------

  private startPolling() {
    this.stopPolling();
    // SSE active: 10s safety net (SSE handles real-time; Centrifugo only
    // pushes on change and can drop silently). SSE down: 3s. Background: 6s
    // (timers are paused anyway; matters only if the OS keeps them alive).
    let pollInterval: number;
    if (this.isInBackground) {
      pollInterval = TIMING.NOW_PLAYING_POLL_INTERVAL * 2;
    } else if (this.sseConnected) {
      pollInterval = 10000;
    } else {
      pollInterval = TIMING.NOW_PLAYING_POLL_INTERVAL;
    }
    this.interval = setInterval(() => this.fetchNowPlaying(), pollInterval);
  }

  private stopPolling() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async fetchNowPlaying() {
    // One request at a time; a request made meanwhile (ICY change) is queued.
    if (this.isFetching) {
      this.refetchQueued = true;
      return;
    }
    this.isFetching = true;
    try {
      const response = await fetchWithTimeout(this.pollingUrl, { timeout: 10000 });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as AzuraNowPlayingPayload;
      if (this.isStarted) this.processPayload(data);
    } catch (error) {
      logger.error('NowPlaying fetch error:', error);
    } finally {
      this.isFetching = false;
      if (this.refetchQueued && this.isStarted) {
        this.refetchQueued = false;
        this.fetchNowPlaying();
      } else {
        this.refetchQueued = false;
      }
    }
  }

  // ---------- SSE (primary) ----------

  private connectSSE() {
    if (this.eventSource || !this.isStarted) return;

    const cfConnect = encodeURIComponent(JSON.stringify({ subs: { [this.channel]: {} } }));
    const url = `${this.sseUrl}?cf_connect=${cfConnect}`;

    try {
      const es = new EventSource(url, { timeout: 0 });
      this.eventSource = es;

      es.addEventListener('message', (event: MessageEvent) => {
        if (!event.data) return;
        this.handleSSEMessage(event.data);
      });

      es.addEventListener('error', (event: ErrorEvent | { type: string; message?: string }) => {
        const msg = 'message' in event ? event.message : event.type;
        logger.warn('SSE error, falling back to polling:', msg);
        this.handleSSEDisconnect();
      });

      es.addEventListener('close', () => {
        if (this.eventSource === es) this.handleSSEDisconnect();
      });
    } catch (error) {
      logger.error('Failed to open SSE:', error);
      this.handleSSEDisconnect();
    }
  }

  private handleSSEMessage(raw: string) {
    let parsed: CentrifugoFrame;
    try {
      parsed = JSON.parse(raw) as CentrifugoFrame;
    } catch {
      return; // ignore malformed frames (Centrifugo also sends bare pings)
    }

    if (parsed.connect) {
      this.onSSEConnected();
      return;
    }

    if (parsed.channel === this.channel && parsed.pub?.data?.np) {
      if (!this.sseConnected) this.onSSEConnected();
      this.processPayload(parsed.pub.data.np);
    }
  }

  private onSSEConnected() {
    if (this.sseConnected) return;
    this.sseConnected = true;
    this.sseReconnectDelay = SSE_RECONNECT_BASE_DELAY;
    // Keep slow polling as a safety net (the site does the same): Centrifugo
    // only pushes on change and the SSE can drop silently.
    this.startPolling();
    logger.log('NowPlayingService: SSE connected, polling kept as safety net');
  }

  private handleSSEDisconnect() {
    const wasConnected = this.sseConnected;
    this.closeSSE();
    if (!this.isStarted) return;

    this.startPolling();
    if (wasConnected) this.fetchNowPlaying();

    if (this.sseReconnectTimer) clearTimeout(this.sseReconnectTimer);
    const delay = this.sseReconnectDelay;
    this.sseReconnectDelay = Math.min(this.sseReconnectDelay * 2, SSE_RECONNECT_MAX_DELAY);
    this.sseReconnectTimer = setTimeout(() => {
      this.sseReconnectTimer = null;
      this.connectSSE();
    }, delay);
  }

  private closeSSE() {
    if (!this.eventSource) return;
    const es = this.eventSource;
    // Detach the field synchronously so in-flight handlers short-circuit.
    this.eventSource = null;
    this.sseConnected = false;
    try {
      es.removeAllEventListeners();
    } catch {
      // ignore
    }
    try {
      es.close();
    } catch {
      // ignore — closing an already-closed source can throw on some platforms
    }
  }

  // ---------- Smart re-emit (API-timing fallback only) ----------

  /**
   * Without ICY, re-classify at the moment the listener should reach the
   * next track instead of waiting for the next push/poll.
   */
  private scheduleSmartReemit(audible: AzuraEntry | undefined) {
    this.clearSmartReemit();
    const playedAt = audible?.played_at;
    const duration = audible?.duration;
    if (typeof playedAt !== 'number' || typeof duration !== 'number' || duration <= 0) return;

    const listenerWallClock = Date.now() / 1000 - LISTENER_BUFFER_SECONDS;
    const secondsUntilTransition = playedAt + duration - listenerWallClock;
    if (secondsUntilTransition <= 0) return;

    this.smartReemitTimer = setTimeout(
      () => {
        this.smartReemitTimer = null;
        if (this.lastPayload) this.processPayload(this.lastPayload);
      },
      (secondsUntilTransition + 1) * 1000
    );
  }

  private clearSmartReemit() {
    if (this.smartReemitTimer) {
      clearTimeout(this.smartReemitTimer);
      this.smartReemitTimer = null;
    }
  }

  // ---------- Payload processing ----------

  private processPayload(data: AzuraNowPlayingPayload) {
    // Reject out-of-order payloads (slow poll arriving after a faster SSE
    // frame). Reset after 30s+ to tolerate server clock adjustments.
    const playedAt = data.now_playing?.played_at ?? 0;
    if (!data.live?.is_live && playedAt > 0 && this.lastProcessedPlayedAt > 0) {
      const staleSince = Date.now() / 1000 - this.lastProcessedPlayedAt;
      if (playedAt < this.lastProcessedPlayedAt && staleSince < 30) {
        return;
      }
    }
    if (playedAt > 0) {
      this.lastProcessedPlayedAt = playedAt;
    }
    this.lastPayload = data;
    this.prefetchNextArtwork(data);

    if (data.live?.is_live) {
      this.clearSmartReemit();
      this.emit(classifyEntry(data, undefined));
      return;
    }

    // 1. ICY: the stream says exactly what is audible — find it in the API.
    if (this.icyIsFresh() && this.streamTitle) {
      const entry = findEntryByStreamTitle(data, this.streamTitle);
      if (entry) {
        this.clearSmartReemit();
        this.clearIcyRefetch();
        this.emit(classifyEntry(data, entry));
        return;
      }
      // Not in the API yet (just started) — keep the current state and ask
      // again shortly; give up after a few tries and use API timing.
      if (this.icyRefetches < ICY_MAX_REFETCHES) {
        if (!this.icyRefetchTimer) {
          this.icyRefetches++;
          this.icyRefetchTimer = setTimeout(() => {
            this.icyRefetchTimer = null;
            this.fetchNowPlaying();
          }, ICY_REFETCH_DELAY_MS);
        }
        return;
      }
    }

    // 2. Fallback: API timing with the listener buffer offset.
    const history = Array.isArray(data.song_history) ? data.song_history : [];
    const audible = pickAudibleEntry(data.now_playing, history, Date.now() / 1000);
    this.emit(classifyEntry(data, audible));
    this.scheduleSmartReemit(audible);
  }

  /** Warm the image cache with the next track's cover so the swap is instant. */
  private prefetchNextArtwork(data: AzuraNowPlayingPayload) {
    const art = data.playing_next?.song?.art;
    if (!art || art === this.lastPrefetchedArt) return;
    this.lastPrefetchedArt = art;
    ExpoImage.prefetch(art).catch(() => {
      // Best-effort.
    });
  }

  private emit(data: NowPlayingData) {
    if (!dataChanged(this.currentData, data)) return;
    this.currentData = data;

    const artUrl = artOf(data);
    if (artUrl) {
      ExpoImage.prefetch(artUrl).catch(() => {
        // Best-effort — the <Image> component retries on its own.
      });
    }

    if (data.mode === 'music' && data.song) {
      logger.log('NowPlaying [music]:', data.song.title, '-', data.song.artist);
    } else if (data.mode === 'liveShow') {
      logger.log('NowPlaying [live]:', data.liveShowName);
    } else if (data.mode === 'podcast') {
      logger.log('NowPlaying [podcast]:', data.podcastName);
    } else if (data.mode === 'announcement') {
      logger.log('NowPlaying [announcement]:', data.announcementName);
    } else {
      logger.log('NowPlaying [idle]');
    }
    [...this.listeners].forEach((l) => l(data));
  }
}

export const nowPlayingService = new NowPlayingService();
