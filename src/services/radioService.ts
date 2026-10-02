import { setAudioModeAsync, AudioPlayer, createAudioPlayer } from 'expo-audio';
import { AppState, AppStateStatus, Platform } from 'react-native';
import Constants from 'expo-constants';
import { siteConfig } from '../config/site';
import { radioSettingsService, RadioSettings } from './radioSettingsService';
import { nowPlayingService } from './nowPlayingService';
import { getLogoUri } from '../utils/artworkCache';
import * as ExpoMediaSession from '../../modules/expo-media-session/src';
import { logger } from '../utils/logger';
import { TIMING, LIMITS } from '../config/constants';

// Identifica a app nas estatísticas de audiência (AzuraCast / painel admin).
// Sem isto o stream chega como "okhttp/x" (Android) ou "AppleCoreMedia" (iOS),
// iguais aos de outras apps de rádio e do Safari.
const STREAM_USER_AGENT = `OlhaQueDuas/${Constants.expoConfig?.version ?? '0'} (${
  Platform.OS === 'ios' ? 'iOS' : 'Android'
})`;

/**
 * Radio streaming service — clean separation:
 * - expo-audio: audio streaming only (ExoPlayer)
 * - ExpoMediaSession module: foreground service, MediaSession, notification,
 *   WiFi lock, lock screen controls, media button handling
 *
 * expo-audio's setActiveForLockScreen is NEVER called. Our native
 * MediaService owns the entire notification and MediaSession — including
 * the now-playing metadata, which it resolves from the stream's ICY title
 * (in sync with the audio) + the AzuraCast API, even with JS timers paused.
 *
 * Live stream rules:
 * - Resuming always re-opens the stream (never plays the stale buffer kept
 *   during a pause — the listener would hear old audio, out of sync).
 * - The server ending the connection reaches us as "ended" (didJustFinish),
 *   not as an error — it triggers a reconnect.
 * - Reconnect waits use a native timer: JS timers don't run in background.
 */
class RadioService {
  private player: AudioPlayer | null = null;
  private playerSubscription: { remove: () => void } | null = null;
  private isInitialized: boolean = false;
  private isPlaying: boolean = false;
  private volume: number = 1.0;
  private onStatusChange: ((_status: RadioStatus) => void) | null = null;
  private isIntentionallyStopped: boolean = true;
  private reconnectPending: boolean = false;
  private reconnectAttempts: number = 0;
  private settings: RadioSettings | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private isBuffering: boolean = false;
  private isPlayInProgress: boolean = false;
  private statusPollingInterval: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private lastAppState: AppStateStatus = 'active';
  private bufferingStartedAt: number = 0;
  private backgroundTransitionAt: number | null = null;
  // Timestamp of last confirmed playing state — used to debounce external
  // pause detection (ignore brief hiccups shorter than 500ms).
  private lastPlayingAt: number = 0;
  private autoplayTimeout: ReturnType<typeof setTimeout> | null = null;

  // MediaSession state — tracks whether our native service is running.
  private mediaSessionActive: boolean = false;
  private lastNotifiedPlaying: boolean | null = null;
  private remotePlaySub: { remove: () => void } | null = null;
  private remotePauseSub: { remove: () => void } | null = null;
  private remoteStopSub: { remove: () => void } | null = null;
  private streamTitleSub: { remove: () => void } | null = null;
  private streamErrorSub: { remove: () => void } | null = null;
  // When playback was stopped by the system (audio focus loss, etc.). Used to
  // re-sync with the live stream if the system later resumes it.
  private externallyPausedAt: number | null = null;
  // Incremented on every pause/stop/new play — a pending reconnect wait that
  // finds a different value was superseded and must not act.
  private playbackGeneration: number = 0;

  // Logo URI getter — always returns the best available URI (file:// after
  // prefetch, remote URL before). NOT cached as a field because prefetchLogo
  // is fire-and-forget and may complete after the first play().
  private get logoUri(): string {
    return getLogoUri(siteConfig.radio.logoUrl);
  }

  /** Build the AzuraCast nowplaying API URL from the stream URL. */
  private get pollingUrl(): string {
    const url = new URL(siteConfig.radio.streamUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const shortcode = pathParts[1] || 'olha_que_duas';
    return `${url.protocol}//${url.host}/api/nowplaying/${shortcode}`;
  }

  /** Cancel a pending reconnect wait (it checks the generation when it wakes). */
  private clearReconnectTimeout() {
    if (this.reconnectPending) {
      this.reconnectPending = false;
      this.playbackGeneration++;
    }
  }

  private removePlayerListener() {
    if (this.playerSubscription) {
      this.playerSubscription.remove();
      this.playerSubscription = null;
    }
  }

  private resetNotificationCache() {
    this.lastNotifiedPlaying = null;
  }

  private get streamSource() {
    return { uri: siteConfig.radio.streamUrl, headers: { 'User-Agent': STREAM_USER_AGENT } };
  }

  /** Set up listeners for lock screen / notification / headset transport controls. */
  private setupRemoteListeners() {
    // Decide by what the player is actually doing, not by our flags: after
    // an audio-focus loss the system pauses the player behind our back and
    // a "Play" press must still start the radio.
    this.remotePlaySub = ExpoMediaSession.addRemotePlayListener(() => {
      logger.log('Remote play event received');
      if (!this.isPlaying || this.isIntentionallyStopped || !(this.player?.playing ?? false)) {
        this.play();
      }
    });

    this.remotePauseSub = ExpoMediaSession.addRemotePauseListener(() => {
      logger.log('Remote pause event received');
      this.pause();
    });

    this.streamErrorSub = ExpoMediaSession.addStreamErrorListener((code) => {
      this.handleStreamFailure(`Stream error (${code})`);
    });

    this.streamTitleSub = ExpoMediaSession.addStreamTitleListener((title) => {
      if (this.isIntentionallyStopped || !title) return;
      nowPlayingService.onStreamTitle(title);
    });

    this.remoteStopSub = ExpoMediaSession.addRemoteStopListener(() => {
      logger.log('Remote stop event received');
      this.stop();
    });
  }

  private cleanupRemoteListeners() {
    this.remotePlaySub?.remove();
    this.remotePlaySub = null;
    this.remotePauseSub?.remove();
    this.remotePauseSub = null;
    this.remoteStopSub?.remove();
    this.remoteStopSub = null;
    this.streamTitleSub?.remove();
    this.streamTitleSub = null;
    this.streamErrorSub?.remove();
    this.streamErrorSub = null;
  }

  private stopStatusPolling() {
    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval);
      this.statusPollingInterval = null;
    }
  }

  private startStatusPolling() {
    this.stopStatusPolling();
    this.statusPollingInterval = setInterval(() => {
      this.pollPlayerStatus();
    }, TIMING.RADIO_STATUS_POLL_INTERVAL);
  }

  /** The system (not the user) stopped playback — e.g. audio focus loss. */
  private markExternallyPaused(reason: string) {
    logger.log(reason);
    this.isIntentionallyStopped = true;
    this.isPlaying = false;
    this.isBuffering = false;
    this.bufferingStartedAt = 0;
    this.externallyPausedAt = Date.now();
    this.clearReconnectTimeout();
    this.unsubscribeFromNowPlaying();
    this.emitStatus(false);
  }

  /**
   * The player started again without us asking (audio focus regained after
   * a call, lock screen of another controller, ...). A short interruption
   * just continues; a long one re-opens the stream so the listener is back
   * on the live audio instead of the stale buffer kept during the pause.
   */
  private handleExternalResume() {
    const pausedFor = this.externallyPausedAt != null ? Date.now() - this.externallyPausedAt : 0;
    this.externallyPausedAt = null;
    if (pausedFor > TIMING.RADIO_LIVE_RESYNC_AFTER) {
      logger.log(`External resume after ${pausedFor}ms — re-syncing with the live stream`);
      this.play();
      return;
    }
    logger.log('External resume detected');
    this.isIntentionallyStopped = false;
    this.isPlaying = true;
    this.isBuffering = false;
    this.bufferingStartedAt = 0;
    this.lastPlayingAt = Date.now();
    this.subscribeToNowPlaying();
    this.emitStatus(false);
  }

  /**
   * The stream stopped without the user asking: server closed it (the
   * progressive MP3 reaches "ended"), or the connection failed (the player
   * goes "idle" — expo-audio reports no error for it).
   */
  private handleStreamFailure(reason: string) {
    if (this.isIntentionallyStopped || this.reconnectPending) return;
    logger.warn(`${reason} — reconnecting`);
    this.isPlaying = false;
    this.isBuffering = false;
    this.bufferingStartedAt = 0;
    if (this.settings?.autoReconnect ?? true) {
      this.emitStatus(true);
      this.reconnect();
    } else {
      this.markExternallyPaused(`${reason} and auto-reconnect is off`);
    }
  }

  private isInBackgroundGracePeriod(): boolean {
    return (
      this.backgroundTransitionAt != null &&
      Date.now() - this.backgroundTransitionAt < TIMING.RADIO_BG_GRACE_PERIOD
    );
  }

  private pollPlayerStatus() {
    if (!this.player) return;

    try {
      const playerPlaying = this.player.playing ?? false;
      const playerBuffering = this.player.isBuffering ?? false;
      const wasPlaying = this.isPlaying;
      const wasBuffering = this.isBuffering;

      // Detect external resume (system resumed the player behind our back)
      if (this.isIntentionallyStopped) {
        if (playerPlaying && this.externallyPausedAt != null) {
          this.handleExternalResume();
        }
        return;
      }

      // A reconnect is already scheduled — don't second-guess it.
      if (this.reconnectPending) return;

      // Detect external pause — debounce brief hiccups and the activity
      // lifecycle transition right after going to background.
      if (wasPlaying && !playerPlaying && !playerBuffering) {
        const tooSoon = Date.now() - this.lastPlayingAt < 500;
        if (this.isInBackgroundGracePeriod() || tooSoon) {
          return;
        }
        this.markExternallyPaused('Polling: External pause detected');
        return;
      }

      this.isPlaying = playerPlaying;
      this.isBuffering = playerBuffering;

      // Stall detection + track lastPlayingAt for debounce
      if (playerPlaying) {
        this.lastPlayingAt = Date.now();
      }
      if (playerBuffering && !playerPlaying) {
        if (this.bufferingStartedAt === 0) {
          this.bufferingStartedAt = Date.now();
        } else if (
          Date.now() - this.bufferingStartedAt > TIMING.RADIO_STALL_TIMEOUT &&
          this.settings?.autoReconnect
        ) {
          logger.warn('Stream stalled in buffering, triggering reconnect');
          this.bufferingStartedAt = 0;
          this.reconnect();
          return;
        }
      } else if (playerPlaying) {
        this.bufferingStartedAt = 0;
      }

      const isLoading = !this.isPlaying && !this.isIntentionallyStopped;
      if (wasPlaying !== this.isPlaying || wasBuffering !== this.isBuffering) {
        this.emitStatus(isLoading);
      }
    } catch (error) {
      logger.error('Error polling player status:', error);
    }
  }

  async initialize(preloadedSettings?: RadioSettings) {
    if (this.isInitialized) return;

    try {
      this.settings = preloadedSettings ?? (await radioSettingsService.load());
      this.volume = this.settings.volume;

      this.settingsUnsubscribe = radioSettingsService.subscribe((newSettings) => {
        this.handleSettingsChange(newSettings);
      });

      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: this.settings.backgroundPlayback,
        interruptionMode: 'doNotMix',
      });

      this.setupAppStateListener();
      this.setupRemoteListeners();
      this.isInitialized = true;
      logger.log('RadioService initialized');

      if (this.settings.autoPlayOnStart) {
        this.autoplayTimeout = setTimeout(() => {
          this.autoplayTimeout = null;
          this.play();
        }, TIMING.RADIO_AUTOPLAY_DELAY);
      }
    } catch (error) {
      logger.error('Error initializing RadioService:', error);
    }
  }

  private setupAppStateListener(): void {
    this.lastAppState = AppState.currentState;
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus): Promise<void> => {
    logger.log('AppState changed:', this.lastAppState, '->', nextAppState);

    if (this.lastAppState.match(/inactive|background/) && nextAppState === 'active') {
      this.backgroundTransitionAt = null;

      if (this.player && !this.isIntentionallyStopped && !this.reconnectPending) {
        const playerPlaying = this.player.playing ?? false;
        const playerBuffering = this.player.isBuffering ?? false;
        if (!playerPlaying && !playerBuffering) {
          this.markExternallyPaused('Player paused during background, marking as stopped');
        }
      }

      if (this.player && !this.statusPollingInterval) {
        this.startStatusPolling();
      }
    }

    if (nextAppState === 'background') {
      this.backgroundTransitionAt = Date.now();

      if (this.settings?.stopOnClose && this.isPlaying) {
        logger.log('Stopping radio due to stopOnClose setting');
        await this.stop();
      }
    }

    this.lastAppState = nextAppState;
  };

  private async handleSettingsChange(newSettings: RadioSettings) {
    const oldSettings = this.settings;
    this.settings = newSettings;

    if (oldSettings?.volume !== newSettings.volume) {
      this.volume = newSettings.volume;
      if (this.player) {
        this.player.volume = this.volume;
      }
    }

    if (oldSettings?.backgroundPlayback !== newSettings.backgroundPlayback) {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: newSettings.backgroundPlayback,
          interruptionMode: 'doNotMix',
        });
      } catch (error) {
        logger.error('Error updating audio mode:', error);
      }
    }
  }

  setStatusCallback(callback: (_status: RadioStatus) => void) {
    this.onStatusChange = callback;
  }

  private emitStatus(isLoading: boolean = false) {
    // Sync notification playback state with actual player state.
    if (this.mediaSessionActive && this.isPlaying !== this.lastNotifiedPlaying) {
      ExpoMediaSession.updatePlaybackState(this.isPlaying);
      this.lastNotifiedPlaying = this.isPlaying;
    }

    if (this.onStatusChange) {
      this.onStatusChange({
        isPlaying: this.isPlaying,
        volume: this.volume,
        isLoading: isLoading,
        isReconnecting: this.reconnectAttempts > 0,
        reconnectAttempt: this.reconnectAttempts,
      });
    }
  }

  async play(): Promise<boolean> {
    if (this.isPlayInProgress) {
      logger.log('Play already in progress, ignoring');
      return false;
    }
    this.isPlayInProgress = true;

    try {
      this.isIntentionallyStopped = false;
      this.externallyPausedAt = null;
      this.bufferingStartedAt = 0;
      this.lastPlayingAt = Date.now();
      this.clearReconnectTimeout();
      this.stopStatusPolling();
      this.emitStatus(true);

      if (!this.isInitialized) {
        await this.initialize();
      }

      // FAST PATH — reuse the existing player, but always re-open the
      // stream. A paused live stream keeps a stale buffer (and the server
      // drops the idle connection): plain play() would replay old audio
      // and then hit "ended" — silence, or the ad cut in half.
      if (this.player) {
        try {
          this.player.replace(this.streamSource);
          this.player.volume = this.volume;
          this.player.play();
          // Service is already running (paused state) — update to playing.
          if (this.mediaSessionActive) {
            ExpoMediaSession.updatePlaybackState(true);
            this.lastNotifiedPlaying = true;
          }
          this.subscribeToNowPlaying();
          this.startStatusPolling();
          this.emitStatus(true);
          logger.log('Radio stream re-opened (player reused)');
          return true;
        } catch (resumeError) {
          logger.warn('Re-open failed, falling back to recreate:', resumeError);
          this.removePlayerListener();
          ExpoMediaSession.detachPlayer();
          try {
            this.player.release();
          } catch {
            // ignore
          }
          this.player = null;
        }
      }

      // SLOW PATH — create new player
      logger.log('Creating audio player for:', siteConfig.radio.streamUrl);

      this.player = createAudioPlayer(this.streamSource);
      this.player.volume = this.volume;

      this.playerSubscription = this.player.addListener('playbackStatusUpdate', (status) => {
        this.handlePlaybackStatus(status);
      });

      // ICY StreamTitle from the stream itself → native notification + UI,
      // in sync with what is being heard.
      ExpoMediaSession.attachPlayer(this.player).then((attached) => {
        if (!attached) logger.warn('ICY metadata unavailable — using API timing only');
      });

      if (!this.mediaSessionActive) {
        // Start our foreground service FIRST — this keeps the process alive
        // in background and shows the initial notification with radio name.
        ExpoMediaSession.activate({
          title: siteConfig.radio.name,
          artist: siteConfig.radio.tagline,
          artworkUri: this.logoUri,
        });
        this.mediaSessionActive = true;
        // Force fresh playback state updates — the native service just
        // started, so cached dedup keys from a previous session must not block.
        this.resetNotificationCache();

        // Native now-playing resolution (ICY + API) — owns the notification
        // metadata and keeps working with the JS timers paused in background.
        ExpoMediaSession.startMetadataPolling(this.pollingUrl);
      }

      this.player.play();

      this.unsubscribeFromNowPlaying();
      this.subscribeToNowPlaying();
      this.startStatusPolling();

      this.emitStatus(true);

      logger.log('Radio stream starting...');
      return true;
    } catch (error) {
      logger.error('Error playing radio:', error);
      this.isPlaying = false;
      this.emitStatus(false);

      if (!this.isIntentionallyStopped && this.settings?.autoReconnect) {
        this.reconnect();
      }
      return false;
    } finally {
      this.isPlayInProgress = false;
    }
  }

  private handlePlaybackStatus(status: {
    error?: string;
    isLoaded?: boolean;
    isPlaying?: boolean;
    isBuffering?: boolean;
    playing?: boolean;
    buffering?: boolean;
    didJustFinish?: boolean;
    playbackState?: string;
  }) {
    const newIsPlaying = status.isPlaying ?? status.playing ?? false;
    const newIsBuffering = status.isBuffering ?? status.buffering ?? false;

    if (this.isIntentionallyStopped) {
      if (newIsPlaying && this.externallyPausedAt != null) {
        this.handleExternalResume();
      }
      return;
    }

    if (status.error) {
      logger.error('Playback error:', status.error);
      this.isPlaying = false;
      this.isBuffering = false;
      this.bufferingStartedAt = 0;
      this.emitStatus(false);

      if (this.settings?.autoReconnect) {
        this.reconnect();
      }
      return;
    }

    if (status.didJustFinish || status.playbackState === 'ended') {
      this.handleStreamFailure('Stream ended by the server');
      return;
    }
    // "idle" while we want to play = the load failed (network lost, DNS...).
    // Skip the first instant after play(): the player starts idle.
    if (status.playbackState === 'idle' && Date.now() - this.lastPlayingAt > 1000) {
      this.handleStreamFailure('Stream connection failed');
      return;
    }

    const wasPlaying = this.isPlaying;
    const wasBuffering = this.isBuffering;

    // Detect external pause (audio focus loss, other app). Debounce brief
    // hiccups and the lifecycle transition right after going to background.
    // Not suppressed in background any more: otherwise the notification kept
    // saying "playing" while silent, and its Play button did nothing.
    if (wasPlaying && !newIsPlaying && !newIsBuffering && !this.reconnectPending) {
      const tooSoon = Date.now() - this.lastPlayingAt < 500;
      if (this.isInBackgroundGracePeriod() || tooSoon) {
        return;
      }
      this.markExternallyPaused('External pause detected (audio focus or system)');
      return;
    }

    this.isPlaying = newIsPlaying;
    this.isBuffering = newIsBuffering;
    if (newIsPlaying) {
      this.bufferingStartedAt = 0;
      this.lastPlayingAt = Date.now();
      if (!newIsBuffering) this.reconnectAttempts = 0;
    }

    const isLoading = !this.isPlaying && !this.isIntentionallyStopped;
    if (wasPlaying !== this.isPlaying || wasBuffering !== this.isBuffering) {
      this.emitStatus(isLoading);
    }
  }

  /**
   * Keep the in-app now-playing service running while the radio plays. The
   * notification metadata is resolved natively (MediaService), so nothing
   * here writes to it.
   */
  private subscribeToNowPlaying() {
    try {
      nowPlayingService.start();
    } catch (error) {
      logger.error('Failed to start nowPlayingService:', error);
    }
  }

  private unsubscribeFromNowPlaying() {
    nowPlayingService.stop();
  }

  private reconnect() {
    if (this.isIntentionallyStopped) return;
    // Prevent piling up multiple reconnects from concurrent detections.
    if (this.reconnectPending) return;
    if (this.reconnectAttempts >= LIMITS.MAX_RECONNECT_ATTEMPTS) {
      logger.log('Max reconnect attempts reached, giving up');
      this.reconnectAttempts = 0;
      this.isPlaying = false;
      this.isBuffering = false;
      this.bufferingStartedAt = 0;
      this.isIntentionallyStopped = true;
      this.stopStatusPolling();
      this.unsubscribeFromNowPlaying();
      this.emitStatus(false);
      return;
    }

    // Exponential backoff with jitter to avoid thundering herd on server recovery.
    const baseDelay = Math.min(
      TIMING.RADIO_RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      TIMING.RADIO_MAX_RECONNECT_DELAY
    );
    const delay = Math.round(baseDelay * (0.8 + Math.random() * 0.4));
    this.reconnectAttempts++;

    logger.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.emitStatus(true);

    // Native timer: setTimeout would not fire with the screen off.
    this.reconnectPending = true;
    const generation = this.playbackGeneration;
    ExpoMediaSession.sleep(delay).then(() => {
      if (generation !== this.playbackGeneration || !this.reconnectPending) return;
      this.reconnectPending = false;
      if (!this.isIntentionallyStopped) {
        this.play();
      }
    });
  }

  async pause(): Promise<void> {
    this.isIntentionallyStopped = true;
    this.externallyPausedAt = null;
    this.isPlaying = false;
    this.reconnectAttempts = 0;
    this.bufferingStartedAt = 0;

    if (this.player) {
      try {
        this.player.pause();
      } catch (e) {
        logger.error('Error pausing player:', e);
      }
    }

    // Update notification to paused state (keep notification visible).
    if (this.mediaSessionActive) {
      ExpoMediaSession.updatePlaybackState(false);
      this.lastNotifiedPlaying = false;
    }

    this.clearReconnectTimeout();
    this.stopStatusPolling();
    this.unsubscribeFromNowPlaying();
    this.emitStatus();
  }

  async stop(): Promise<void> {
    this.isIntentionallyStopped = true;
    this.externallyPausedAt = null;
    this.isPlaying = false;
    this.reconnectAttempts = 0;
    this.bufferingStartedAt = 0;
    this.resetNotificationCache();

    if (this.player) {
      try {
        this.player.pause();
      } catch (e) {
        logger.error('Error pausing player:', e);
      }
      this.removePlayerListener();
      ExpoMediaSession.detachPlayer();
      try {
        this.player.release();
      } catch (releaseError) {
        logger.error('Error releasing player:', releaseError);
      }
      this.player = null;
    }

    // Stop the foreground service — removes notification, releases WiFi lock.
    if (this.mediaSessionActive) {
      try {
        ExpoMediaSession.stopMetadataPolling();
        ExpoMediaSession.deactivate();
      } catch (e) {
        logger.error('Error deactivating media session:', e);
      }
      this.mediaSessionActive = false;
    }

    this.clearReconnectTimeout();
    this.stopStatusPolling();
    this.unsubscribeFromNowPlaying();
    this.emitStatus();
  }

  async setVolume(value: number): Promise<void> {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(1, value));

    if (this.settings) {
      await radioSettingsService.updateSetting('volume', this.volume);
    }

    if (this.player) {
      try {
        this.player.volume = this.volume;
      } catch (error) {
        logger.error('Error setting volume:', error);
      }
    }

    this.emitStatus();
  }

  async togglePlayPause(): Promise<boolean> {
    if (this.isPlaying) {
      await this.pause();
      return false;
    } else {
      return await this.play();
    }
  }

  async forceReconnect(): Promise<boolean> {
    this.reconnectAttempts = 0;
    this.clearReconnectTimeout();
    return await this.play();
  }

  getStatus(): RadioStatus {
    return {
      isPlaying: this.isPlaying,
      volume: this.volume,
      isLoading: false,
      isReconnecting: this.reconnectAttempts > 0,
      reconnectAttempt: this.reconnectAttempts,
    };
  }

  getSettings(): RadioSettings | null {
    return this.settings;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async cleanup() {
    if (this.autoplayTimeout) {
      clearTimeout(this.autoplayTimeout);
      this.autoplayTimeout = null;
    }
    this.clearReconnectTimeout();
    this.bufferingStartedAt = 0;
    this.resetNotificationCache();

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
    this.stopStatusPolling();
    this.unsubscribeFromNowPlaying();
    this.cleanupRemoteListeners();

    await this.stop();
    this.isInitialized = false;
  }
}

export interface RadioStatus {
  isPlaying: boolean;
  volume: number;
  isLoading: boolean;
  isReconnecting?: boolean;
  reconnectAttempt?: number;
}

export const radioService = new RadioService();
