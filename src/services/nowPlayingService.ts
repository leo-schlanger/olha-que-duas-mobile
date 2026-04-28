import { AppState, AppStateStatus } from 'react-native';
import EventSource, { ErrorEvent, MessageEvent } from 'react-native-sse';
import { Image as ExpoImage } from 'expo-image';
import { siteConfig } from '../config/site';
import { logger } from '../utils/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { TIMING, LIMITS } from '../config/constants';
import { getCachedArtwork, getLocalArtwork } from '../utils/artworkCache';

export interface NowPlayingSong {
  title: string;
  artist: string;
  album: string;
  art: string;
}

/**
 * What the radio is broadcasting right now, classified into one of five
 * mutually-exclusive modes. Mirrors the logic of the web app — see
 * `D:/Projetos/olha-que-duas/src/hooks/useNowPlaying.ts` for the reference
 * implementation.
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
  /**
   * `file://` URI of the pre-downloaded artwork, when available. Set
   * shortly after `emit` once the artworkCache finishes the download.
   * Consumers (radioService → ExpoMediaSession.updateMetadata) should prefer
   * this over the remote URL because the native side loads file:// in
   * <10ms vs hundreds of ms for a remote fetch.
   */
  localArtUri: string | null;
  /** Legacy boolean kept for backwards compatibility — equals (mode === 'music') */
  isMusic: boolean;
}

const IDLE_DATA: NowPlayingData = {
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

// Playlists whose tracks are regular music programming. If the playlist name
// matches one of these, we DON'T promote the entry to "podcast" even if the
// metadata looks unusual.
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
];

// Playlists dedicated to announcements / sponsored spots / event promos.
// These get their own artwork on screen even when the track is shorter than
// MIN_SONG_DURATION_SECONDS — the visual is the whole point.
const ANNOUNCEMENT_PLAYLIST_PATTERNS = [
  /an[uú]ncio/i,
  /especial/i,
  /destaque/i,
  /aviso/i,
  /evento/i,
];

// Icecast burst (~2-3s @ 192kbps) + decoder buffer (~3-5s) means the listener
// hears what the server transmitted ~4s ago. We compensate by selecting the
// "audible" entry from `now_playing + song_history` instead of trusting the
// raw `now_playing`.
const LISTENER_BUFFER_SECONDS = 4;

// Grace window after a valid entry ends, before falling back to the radio
// logo. Covers typical jingles (5-8s) so the UI doesn't flash neutral
// between two songs.
const HOLD_PREVIOUS_ON_GAP_SECONDS = 8;

const SSE_RECONNECT_BASE_DELAY = 1000;
const SSE_RECONNECT_MAX_DELAY = 30000;

// How long (seconds) to hold the anti-flicker lock after a new track is
// anticipated. 10s covers the worst-case Icecast burst buffer (~3s) +
// decoder latency (~2s) + network jitter (~5s). After expiry, the
// normal pickAudibleEntry takes over.
const ANTI_FLICKER_LOCK_S = 10;

interface AzuraEntry {
  played_at?: number;
  duration?: number;
  playlist?: string;
  song?: { title?: string; artist?: string; album?: string; art?: string };
}

interface AzuraNowPlayingPayload {
  live?: { is_live?: boolean; streamer_name?: string };
  now_playing?: AzuraEntry;
  song_history?: AzuraEntry[];
}

interface CentrifugoFrame {
  connect?: unknown;
  channel?: string;
  pub?: { data?: { np?: AzuraNowPlayingPayload } };
}

function isValidSong(data: {
  title?: string;
  artist?: string;
  playlist?: string;
  duration?: number;
}): boolean {
  const { title, artist, playlist, duration } = data;

  if (!title || title.trim() === '') return false;
  if (!artist || artist.trim() === '' || artist.toLowerCase() === 'unknown') return false;
  if (duration && duration < LIMITS.MIN_SONG_DURATION_SECONDS) return false;
  if (JINGLE_PATTERNS.some((p) => p.test(title!))) return false;
  if (JINGLE_PATTERNS.some((p) => p.test(artist!))) return false;
  if (playlist && JINGLE_PLAYLISTS.some((p) => p.test(playlist))) return false;

  return true;
}

/**
 * AzuraCast's `now_playing` is "what the SERVER is transmitting right now",
 * but the listener hears it ~LISTENER_BUFFER_SECONDS later. We pick the
 * entry from now_playing+history whose `[played_at, played_at+duration)`
 * window contains the listener wall-clock. Returns undefined when the
 * listener is in a gap between known entries (typically a jingle that
 * AzuraCast doesn't expose in song_history) — letting the caller decide
 * whether to hold the previous state or fall back to neutral.
 */
function pickAudibleEntry(
  nowPlaying: AzuraEntry | undefined,
  history: AzuraEntry[],
  nowEpoch: number
): AzuraEntry | undefined {
  if (!nowPlaying) return undefined;
  const listenerWallClock = nowEpoch - LISTENER_BUFFER_SECONDS;
  const candidates: AzuraEntry[] = [nowPlaying, ...history];
  for (const entry of candidates) {
    const playedAt = entry.played_at;
    const duration = entry.duration;
    if (typeof playedAt !== 'number' || typeof duration !== 'number' || duration <= 0) continue;
    if (playedAt <= listenerWallClock && listenerWallClock < playedAt + duration) {
      return entry;
    }
  }
  return undefined;
}

function dataChanged(prev: NowPlayingData, next: NowPlayingData): boolean {
  if (prev.mode !== next.mode) return true;
  // localArtUri changing must trigger a re-emit so the lock screen can swap
  // from "remote URL with download delay" to "local file:// instant" once the
  // pre-download finishes. Otherwise the only-art-changed re-emit is dropped.
  if (prev.localArtUri !== next.localArtUri) return true;
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
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private isStarted = false;

  // SSE state
  private eventSource: EventSource | null = null;
  private sseConnected = false;
  private sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sseReconnectDelay = SSE_RECONNECT_BASE_DELAY;

  // Smart re-emit + hold-on-gap state
  private lastPayload: AzuraNowPlayingPayload | null = null;
  // Timestamp of the latest processed now_playing entry — used to reject
  // out-of-order responses (e.g., slow poll arriving after a faster SSE frame).
  private lastProcessedPlayedAt: number = 0;
  private lastAudibleEndAt: number | null = null;
  private smartReemitTimer: ReturnType<typeof setTimeout> | null = null;

  // Anti-flicker lock (ported from the web sister project).
  // When the server pushes a new track but the listener is still hearing
  // the tail of the previous track (due to Icecast buffer), `pickAudibleEntry`
  // would bounce back to the old track, causing a visual flicker. The lock
  // "pins" the UI to the new track for a few seconds until the listener
  // buffer catches up. Expires after LOCK_DURATION_S.
  private anticipatedTrack: {
    title: string;
    artist: string;
    playedAt: number;
    lockUntil: number;
  } | null = null;

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

      // We intentionally KEEP the SSE connection open in background. The
      // expo-audio foreground service keeps the JS context alive while
      // playback is on, so the socket survives — and that's the only way
      // the lock-screen artwork can update within seconds of a track
      // change. Polling stays as a fallback in case the SSE drops.
      if (this.isInBackground) {
        // Reconfigure polling to background cadence (slower, but still a
        // sensible safety net if SSE silently disconnects).
        this.startPolling();
      } else {
        this.startPolling();
        // Re-establish SSE only if it was lost while we were in background.
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
    if (this.smartReemitTimer) {
      clearTimeout(this.smartReemitTimer);
      this.smartReemitTimer = null;
    }
    this.sseReconnectDelay = SSE_RECONNECT_BASE_DELAY;
    this.lastPayload = null;
    this.lastProcessedPlayedAt = 0;
    this.lastAudibleEndAt = null;
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

  // ---------- Polling (fallback) ----------

  private startPolling() {
    this.stopPolling();
    // Three cadences — matched to the web sister project strategy:
    // 1) SSE active + foreground: 10s safety net (SSE handles real-time)
    // 2) SSE down + foreground: 3s active polling
    // 3) Background (any): 6s
    let pollInterval: number;
    if (this.isInBackground) {
      pollInterval = TIMING.NOW_PLAYING_POLL_INTERVAL * 2; // 6s
    } else if (this.sseConnected) {
      pollInterval = 10000; // 10s safety net
    } else {
      pollInterval = TIMING.NOW_PLAYING_POLL_INTERVAL; // 3s active
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
    // Guard against concurrent fetches — SSE callback + poll timer can
    // fire at the same time, doubling network requests and processPayload
    // calls on the JS thread.
    if (this.isFetching) return;
    this.isFetching = true;
    try {
      const response = await fetchWithTimeout(this.pollingUrl, { timeout: 10000 });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as AzuraNowPlayingPayload;
      this.processPayload(data);
    } catch (error) {
      logger.error('NowPlaying fetch error:', error);
    } finally {
      this.isFetching = false;
    }
  }

  // ---------- SSE (primary) ----------

  private connectSSE() {
    // No isInBackground guard — the foreground media service keeps the JS
    // context alive during playback, so SSE reconnection works in background
    // and provides real-time lock-screen metadata updates.
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
    // CRITICAL: DO NOT stop polling. The web sister project
    // (D:/Projetos/olha-que-duas) keeps 15s polling even with SSE active
    // as a safety net. Centrifugo only pushes frames when metadata CHANGES
    // (can be 3-5min between songs), and if the SSE silently drops, we'd
    // have zero data flow until the heartbeat timeout detects it.
    // Slow-cadence polling (10s) ensures we're never more than 10s stale.
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
    // Detach the field synchronously so any in-flight handlers that fire
    // between removeAllEventListeners() and close() see eventSource === null
    // and short-circuit (handleSSEMessage / handleSSEDisconnect both branch
    // on it). Prevents orphan callbacks running after close.
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

  // ---------- Hold-on-gap + smart re-emit ----------

  private shouldHoldPrevious(): boolean {
    if (this.lastAudibleEndAt === null) return false;
    const now = Date.now() / 1000;
    return now < this.lastAudibleEndAt + HOLD_PREVIOUS_ON_GAP_SECONDS;
  }

  private recordAudibleEnd(entry: AzuraEntry) {
    if (
      typeof entry.played_at === 'number' &&
      typeof entry.duration === 'number' &&
      entry.duration > 0
    ) {
      this.lastAudibleEndAt = entry.played_at + entry.duration;
    }
  }

  /**
   * Schedule a one-shot re-classification at the moment the listener should
   * transition to the next track. With SSE, the server will usually push the
   * next payload first; this timer is a safety net for cases where the next
   * frame is delayed (or in polling mode between intervals).
   */
  private scheduleSmartReemit(audible: AzuraEntry) {
    this.clearSmartReemit();
    const playedAt = audible.played_at;
    const duration = audible.duration;
    if (typeof playedAt !== 'number' || typeof duration !== 'number' || duration <= 0) return;

    const listenerWallClock = Date.now() / 1000 - LISTENER_BUFFER_SECONDS;
    const secondsUntilTransition = playedAt + duration - listenerWallClock;
    if (secondsUntilTransition <= 0) return;

    const delayMs = (secondsUntilTransition + 1) * 1000;
    this.smartReemitTimer = setTimeout(() => {
      this.smartReemitTimer = null;
      if (this.lastPayload) this.processPayload(this.lastPayload);
    }, delayMs);
  }

  private clearSmartReemit() {
    if (this.smartReemitTimer) {
      clearTimeout(this.smartReemitTimer);
      this.smartReemitTimer = null;
    }
  }

  // ---------- Payload processing ----------

  private processPayload(data: AzuraNowPlayingPayload) {
    // Reject out-of-order payloads: if this payload's now_playing started
    // BEFORE the one we already processed, it's stale (e.g., slow poll arriving
    // after a faster SSE frame). Live shows bypass this check.
    const playedAt = data.now_playing?.played_at ?? 0;
    if (!data.live?.is_live && playedAt > 0 && playedAt < this.lastProcessedPlayedAt) {
      return;
    }
    if (playedAt > 0) {
      this.lastProcessedPlayedAt = playedAt;
    }

    this.lastPayload = data;

    // 1. Live show takes absolute priority — a streamer is on the mic and
    //    the listener buffer is irrelevant here.
    if (data.live?.is_live) {
      this.clearSmartReemit();
      this.lastAudibleEndAt = null;
      this.emit({
        ...IDLE_DATA,
        mode: 'liveShow',
        liveShowName: data.live.streamer_name?.trim() || '',
      });
      return;
    }

    // 2. Pick the entry the listener is actually hearing right now (with
    //    LISTENER_BUFFER_SECONDS offset against song_history).
    const history = Array.isArray(data.song_history) ? data.song_history : [];
    let audible = pickAudibleEntry(data.now_playing, history, Date.now() / 1000);

    // Anti-flicker: if the lock is active and the audible entry would
    // bounce back to a DIFFERENT track (old one still in buffer), override
    // with the server's now_playing so the UI stays pinned on the new track.
    if (this.anticipatedTrack && Date.now() / 1000 < this.anticipatedTrack.lockUntil) {
      const anticipated = this.anticipatedTrack;
      const audibleTitle = audible?.song?.title ?? '';
      const audibleArtist = audible?.song?.artist ?? '';
      if (audibleTitle !== anticipated.title || audibleArtist !== anticipated.artist) {
        // Override: use now_playing (server's latest) instead of the
        // buffer-delayed audible entry. This prevents the brief flash
        // back to the previous track during the buffer transition.
        audible = data.now_playing;
      }
    } else {
      // Lock expired — clear it
      this.anticipatedTrack = null;
    }

    // 3. No audible entry — typically a jingle gap. Hold the previous state
    //    for HOLD_PREVIOUS_ON_GAP_SECONDS to avoid flashing the radio logo.
    if (!audible?.song) {
      if (this.shouldHoldPrevious()) {
        // Keep current state; the next push/poll will resolve it.
        return;
      }
      this.clearSmartReemit();
      this.lastAudibleEndAt = null;
      this.emit(IDLE_DATA);
      return;
    }

    const songData = {
      title: audible.song.title || '',
      artist: audible.song.artist || '',
      playlist: audible.playlist || '',
      duration: audible.duration || 0,
    };

    // 4. Valid music — most common path.
    if (isValidSong(songData)) {
      this.recordAudibleEnd(audible);

      // Anti-flicker: lock on this track so that subsequent polls don't
      // bounce back to the previous track while the listener buffer
      // catches up. The lock auto-expires after ANTI_FLICKER_LOCK_S.
      const nowEpochSec = Date.now() / 1000;
      this.anticipatedTrack = {
        title: songData.title,
        artist: songData.artist,
        playedAt: audible.played_at ?? nowEpochSec,
        lockUntil: nowEpochSec + ANTI_FLICKER_LOCK_S,
      };
      this.emit({
        ...IDLE_DATA,
        mode: 'music',
        isMusic: true,
        song: {
          title: songData.title,
          artist: songData.artist,
          album: audible.song.album || '',
          art: audible.song.art || '',
        },
      });
      this.scheduleSmartReemit(audible);
      return;
    }

    // 5. Not valid music. Could still be podcast / announcement / jingle.
    const playlistName = songData.playlist;
    const isMusicPlaylist =
      !playlistName || MUSIC_PLAYLIST_PATTERNS.some((p) => p.test(playlistName));
    const isLongContent = songData.duration >= LIMITS.MIN_SONG_DURATION_SECONDS;
    const isJingleTitle =
      JINGLE_PATTERNS.some((p) => p.test(songData.title)) ||
      JINGLE_PATTERNS.some((p) => p.test(songData.artist));
    const isAnnouncementPlaylist =
      !!playlistName && ANNOUNCEMENT_PLAYLIST_PATTERNS.some((p) => p.test(playlistName));

    // 5a. Podcast: non-music playlist + long-form + not a jingle.
    if (!isMusicPlaylist && !isJingleTitle && isLongContent) {
      this.recordAudibleEnd(audible);
      this.emit({
        ...IDLE_DATA,
        mode: 'podcast',
        podcastName: playlistName || songData.title,
        podcastArt: audible.song.art || '',
      });
      this.scheduleSmartReemit(audible);
      return;
    }

    // 5b. Announcement / sponsored spot: dedicated playlist, no min duration.
    if (isAnnouncementPlaylist && !isJingleTitle) {
      this.recordAudibleEnd(audible);
      this.emit({
        ...IDLE_DATA,
        mode: 'announcement',
        announcementName: songData.title || playlistName,
        announcementArt: audible.song.art || '',
      });
      this.scheduleSmartReemit(audible);
      return;
    }

    // 5c. Plain jingle / station ID. Hold previous state if recent, else idle.
    if (this.shouldHoldPrevious()) {
      this.scheduleSmartReemit(audible);
      return;
    }
    this.lastAudibleEndAt = null;
    this.emit(IDLE_DATA);
    this.scheduleSmartReemit(audible);
  }

  private emit(data: NowPlayingData) {
    // Determine the artwork remote URL for this data (if any).
    let artUrl: string | null = null;
    if (data.mode === 'music' && data.song?.art) artUrl = data.song.art;
    else if (data.mode === 'podcast' && data.podcastArt) artUrl = data.podcastArt;
    else if (data.mode === 'announcement' && data.announcementArt) artUrl = data.announcementArt;

    // Sync cache hit — if we have already downloaded this art, populate
    // localArtUri before the FIRST emit so the lock screen never shows the
    // remote URL (which would cost a network fetch on the native side).
    if (artUrl) {
      data.localArtUri = getCachedArtwork(artUrl);
    }

    if (!dataChanged(this.currentData, data)) return;
    this.currentData = data;

    // 1) Warm the in-app expo-image cache so the on-screen <Image>
    //    component shows instantly when it mounts/re-renders.
    if (artUrl) {
      ExpoImage.prefetch(artUrl).catch(() => {
        // Best-effort — failure here doesn't break the UI; the <Image>
        // component will retry on its own when it mounts.
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
    }
    [...this.listeners].forEach((l) => l(data));

    // 2) Asynchronously pre-download the artwork to a local file. When it
    //    finishes, re-emit (only) if THIS song is still the current one,
    //    so the lock screen can swap from remote URL to file:// (instant
    //    load on native side). If the cache already had it (above),
    //    localArtUri is set already and this is a no-op.
    if (artUrl && !data.localArtUri) {
      const artUrlAtDispatch = artUrl;
      getLocalArtwork(artUrlAtDispatch)
        .then((localUri) => {
          if (!localUri) return;
          // Resolve race: only re-emit if the now-playing data hasn't
          // moved on to a different song while we were downloading.
          const stillCurrent = this.currentData;
          let stillSameUrl: string | null = null;
          if (stillCurrent.mode === 'music' && stillCurrent.song?.art)
            stillSameUrl = stillCurrent.song.art;
          else if (stillCurrent.mode === 'podcast') stillSameUrl = stillCurrent.podcastArt;
          else if (stillCurrent.mode === 'announcement')
            stillSameUrl = stillCurrent.announcementArt;
          if (stillSameUrl !== artUrlAtDispatch) return;
          if (stillCurrent.localArtUri === localUri) return;

          const updated: NowPlayingData = { ...stillCurrent, localArtUri: localUri };
          this.currentData = updated;
          [...this.listeners].forEach((l) => l(updated));
        })
        .catch(() => {
          // Best effort. Lock screen will use the remote URL as fallback.
        });
    }
  }
}

export const nowPlayingService = new NowPlayingService();
