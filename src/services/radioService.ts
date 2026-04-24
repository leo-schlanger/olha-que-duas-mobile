import { setAudioModeAsync, AudioPlayer, createAudioPlayer } from 'expo-audio';
import { AppState, AppStateStatus } from 'react-native';
import { siteConfig } from '../config/site';
import { radioSettingsService, RadioSettings } from './radioSettingsService';
import { nowPlayingService } from './nowPlayingService';
import { getLogoUri, getLockScreenArtUri } from '../utils/artworkCache';
import * as ExpoMediaSession from '../../modules/expo-media-session/src';
import { logger } from '../utils/logger';
import { TIMING, LIMITS } from '../config/constants';

/**
 * Radio streaming service — hybrid approach:
 * - expo-audio: audio playback + foreground service + notification (via setActiveForLockScreen)
 * - ExpoMediaSession module: WiFi lock only (keeps WiFi alive with screen off)
 *
 * Artwork for the lock screen uses getLockScreenArtUri() which copies artwork
 * to unique file paths (file pool of 3), bypassing expo-audio's URL.equals() bug
 * and eliminating the race condition where the native thread reads a file that
 * was already deleted.
 */
class RadioService {
  private player: AudioPlayer | null = null;
  private playerSubscription: { remove: () => void } | null = null;
  private isInitialized: boolean = false;
  private isPlaying: boolean = false;
  private volume: number = 1.0;
  private onStatusChange: ((_status: RadioStatus) => void) | null = null;
  private isIntentionallyStopped: boolean = true;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private settings: RadioSettings | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private nowPlayingUnsubscribe: (() => void) | null = null;
  private isBuffering: boolean = false;
  private isPlayInProgress: boolean = false;
  private statusPollingInterval: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private lastAppState: AppStateStatus = 'active';
  private lockScreenTimeout: ReturnType<typeof setTimeout> | null = null;
  private bufferingStartedAt: number = 0;
  private lastLockScreenMetaKey: string = '';
  private backgroundTransitionAt: number = 0;
  private wifiLockActive: boolean = false;

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private clearLockScreenTimeout() {
    if (this.lockScreenTimeout) {
      clearTimeout(this.lockScreenTimeout);
      this.lockScreenTimeout = null;
    }
  }

  private removePlayerListener() {
    if (this.playerSubscription) {
      this.playerSubscription.remove();
      this.playerSubscription = null;
    }
  }

  /**
   * Update the lock screen notification. Two-phase approach:
   * 1. expo-audio's setActiveForLockScreen updates title/artist/controls
   * 2. Our native module overrides the artwork bitmap directly on the
   *    notification (bypasses expo-audio's broken loadArtworkFromUrl)
   */
  private updateLockScreen(meta: { title: string; artist: string; artworkUrl: string }) {
    if (!this.player || this.isIntentionallyStopped) return;
    const key = `${meta.title}\x00${meta.artist}\x00${meta.artworkUrl}`;
    if (key === this.lastLockScreenMetaKey) return;
    try {
      // Phase 1: expo-audio updates title/artist and rebuilds notification
      this.player.setActiveForLockScreen(true, meta);
      this.lastLockScreenMetaKey = key;

      // Phase 2: override the artwork bitmap directly on the notification.
      // expo-audio's loadArtworkFromUrl has a URL.equals() bug that prevents
      // bitmap reload for file:// URIs. Our module loads the bitmap via
      // BitmapFactory.decodeFile and re-posts the notification with 200ms delay
      // (after expo-audio's synchronous rebuild has completed).
      if (meta.artworkUrl.startsWith('file://')) {
        ExpoMediaSession.overrideNotificationArtwork(meta.artworkUrl);
      }
    } catch (error) {
      logger.error('Error updating lock screen:', error);
    }
  }

  private resetLockScreenCache() {
    this.lastLockScreenMetaKey = '';
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

  private pollPlayerStatus() {
    if (!this.player) return;

    try {
      const playerPlaying = this.player.playing ?? false;
      const playerBuffering = this.player.isBuffering ?? false;
      const wasPlaying = this.isPlaying;
      const wasBuffering = this.isBuffering;

      // Detect external resume (e.g., user pressed play on lock screen)
      if (this.isIntentionallyStopped && playerPlaying) {
        logger.log('Polling: External resume detected (lock screen play)');
        this.isIntentionallyStopped = false;
        this.isPlaying = true;
        this.isBuffering = playerBuffering;
        this.bufferingStartedAt = 0;
        this.subscribeToNowPlaying();
        this.emitStatus(false);
        return;
      }

      if (this.isIntentionallyStopped) return;

      // Detect external pause — suppress in background
      if (wasPlaying && !playerPlaying && !playerBuffering) {
        const appInBackground = AppState.currentState !== 'active';
        const inGracePeriod =
          Date.now() - this.backgroundTransitionAt < TIMING.RADIO_BG_GRACE_PERIOD;
        if (appInBackground || inGracePeriod) {
          return;
        }
        logger.log('Polling: External pause detected');
        this.isIntentionallyStopped = true;
        this.isPlaying = false;
        this.isBuffering = false;
        this.bufferingStartedAt = 0;
        this.unsubscribeFromNowPlaying();
        this.emitStatus(false);
        return;
      }

      this.isPlaying = playerPlaying;
      this.isBuffering = playerBuffering;

      // Stall detection
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
      this.isInitialized = true;
      logger.log('RadioService initialized');

      if (this.settings.autoPlayOnStart) {
        setTimeout(() => this.play(), TIMING.RADIO_AUTOPLAY_DELAY);
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
      this.backgroundTransitionAt = 0;

      if (this.player && !this.isIntentionallyStopped) {
        const playerPlaying = this.player.playing ?? false;
        if (!playerPlaying) {
          logger.log('Player paused during background, marking as stopped');
          this.isIntentionallyStopped = true;
          this.isPlaying = false;
          this.isBuffering = false;
          this.unsubscribeFromNowPlaying();
          this.emitStatus(false);
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
        if (this.player) {
          try {
            this.player.setActiveForLockScreen(false);
          } catch {
            // best effort
          }
        }
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

  /** Acquire WiFi lock via our native module (prevents WiFi off with screen off) */
  private acquireWifiLock(): void {
    if (this.wifiLockActive) return;
    try {
      ExpoMediaSession.activate({
        title: siteConfig.radio.name,
        artist: siteConfig.radio.tagline,
        artworkUri: '',
      });
      this.wifiLockActive = true;
    } catch (error) {
      logger.warn('WiFi lock acquire failed:', error);
    }
  }

  private releaseWifiLock(): void {
    if (!this.wifiLockActive) return;
    try {
      ExpoMediaSession.deactivate();
      this.wifiLockActive = false;
    } catch (error) {
      logger.warn('WiFi lock release failed:', error);
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
      this.bufferingStartedAt = 0;
      this.clearReconnectTimeout();
      this.clearLockScreenTimeout();
      this.stopStatusPolling();
      this.emitStatus(true);

      if (!this.isInitialized) {
        await this.initialize();
      }

      // FAST PATH — reuse existing player
      if (this.player) {
        try {
          this.player.play();
          this.subscribeToNowPlaying();
          this.startStatusPolling();
          this.reconnectAttempts = 0;
          this.emitStatus(true);
          logger.log('Radio stream resumed (player reused)');
          return true;
        } catch (resumeError) {
          logger.warn('Resume failed, falling back to recreate:', resumeError);
          this.removePlayerListener();
          try {
            this.player.release();
          } catch {
            // ignore
          }
          this.player = null;
          this.resetLockScreenCache();
        }
      }

      // SLOW PATH — create new player
      logger.log('Creating audio player for:', siteConfig.radio.streamUrl);

      this.player = createAudioPlayer({ uri: siteConfig.radio.streamUrl });
      this.player.volume = this.volume;

      this.playerSubscription = this.player.addListener('playbackStatusUpdate', (status) => {
        this.handlePlaybackStatus(status);
      });

      this.player.play();

      // Enable lock screen controls after playback starts.
      // Use the pre-cached file:// logo URI.
      this.lockScreenTimeout = setTimeout(() => {
        this.lockScreenTimeout = null;
        this.updateLockScreen({
          title: siteConfig.radio.name,
          artist: siteConfig.radio.tagline,
          artworkUrl: getLockScreenArtUri(getLogoUri(siteConfig.radio.logoUrl)),
        });
      }, TIMING.RADIO_LOCK_SCREEN_DELAY);

      // Acquire WiFi lock to prevent stream dropout with screen off
      this.acquireWifiLock();

      this.unsubscribeFromNowPlaying();
      this.subscribeToNowPlaying();
      this.startStatusPolling();

      this.reconnectAttempts = 0;
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
  }) {
    if (this.isIntentionallyStopped) return;

    if (status.error) {
      logger.error('Playback error:', status.error);
      this.isPlaying = false;
      this.isBuffering = false;
      this.bufferingStartedAt = 0;
      this.emitStatus(false);

      if (!this.isIntentionallyStopped && this.settings?.autoReconnect) {
        this.reconnect();
      }
      return;
    }

    const wasPlaying = this.isPlaying;
    const wasBuffering = this.isBuffering;

    const newIsPlaying = status.isPlaying ?? status.playing ?? false;
    const newIsBuffering = status.isBuffering ?? status.buffering ?? false;

    // Detect external pause — suppress in background
    if (wasPlaying && !newIsPlaying && !newIsBuffering) {
      const appInBackground = AppState.currentState !== 'active';
      const inGracePeriod =
        Date.now() - this.backgroundTransitionAt < TIMING.RADIO_BG_GRACE_PERIOD;
      if (appInBackground || inGracePeriod) {
        return;
      }
      logger.log('External pause detected (lock screen or system)');
      this.isIntentionallyStopped = true;
      this.isPlaying = false;
      this.isBuffering = false;
      this.bufferingStartedAt = 0;
      this.unsubscribeFromNowPlaying();
      this.emitStatus(false);
      return;
    }

    this.isPlaying = newIsPlaying;
    this.isBuffering = newIsBuffering;
    if (newIsPlaying) {
      this.bufferingStartedAt = 0;
    }

    const isLoading = !this.isPlaying && !this.isIntentionallyStopped;
    if (wasPlaying !== this.isPlaying || wasBuffering !== this.isBuffering) {
      this.emitStatus(isLoading);
    }
  }

  private subscribeToNowPlaying() {
    if (this.nowPlayingUnsubscribe) {
      this.nowPlayingUnsubscribe();
    }

    nowPlayingService.start();

    this.nowPlayingUnsubscribe = nowPlayingService.subscribe((data) => {
      if (!this.player || this.isIntentionallyStopped) return;

      const fallbackLogo = getLogoUri(siteConfig.radio.logoUrl);
      const pickArt = (): string => getLockScreenArtUri(data.localArtUri || fallbackLogo);

      switch (data.mode) {
        case 'music':
          if (data.song) {
            this.updateLockScreen({
              title: data.song.title,
              artist: data.song.artist,
              artworkUrl: pickArt(),
            });
            return;
          }
          break;
        case 'liveShow':
          this.updateLockScreen({
            title: data.liveShowName || siteConfig.radio.name,
            artist: siteConfig.radio.name,
            artworkUrl: getLockScreenArtUri(fallbackLogo),
          });
          return;
        case 'podcast':
          this.updateLockScreen({
            title: data.podcastName,
            artist: siteConfig.radio.name,
            artworkUrl: pickArt(),
          });
          return;
        case 'announcement':
          this.updateLockScreen({
            title: data.announcementName,
            artist: siteConfig.radio.name,
            artworkUrl: pickArt(),
          });
          return;
      }

      // Idle — fall back to radio identity
      this.updateLockScreen({
        title: siteConfig.radio.name,
        artist: siteConfig.radio.tagline,
        artworkUrl: getLockScreenArtUri(fallbackLogo),
      });
    });
  }

  private unsubscribeFromNowPlaying() {
    if (this.nowPlayingUnsubscribe) {
      this.nowPlayingUnsubscribe();
      this.nowPlayingUnsubscribe = null;
    }
    nowPlayingService.stop();
  }

  private reconnect() {
    if (this.isIntentionallyStopped) return;
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

    this.clearReconnectTimeout();

    const delay = Math.min(
      TIMING.RADIO_RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      TIMING.RADIO_MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts++;

    logger.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.emitStatus(true);

    this.reconnectTimeout = setTimeout(() => {
      if (!this.isIntentionallyStopped) {
        this.play();
      }
    }, delay);
  }

  async pause(): Promise<void> {
    this.isIntentionallyStopped = true;
    this.isPlaying = false;
    this.reconnectAttempts = 0;
    this.bufferingStartedAt = 0;
    this.clearLockScreenTimeout();

    if (this.player) {
      try {
        this.player.pause();
      } catch (e) {
        logger.error('Error pausing player:', e);
      }
    }

    this.clearReconnectTimeout();
    this.stopStatusPolling();
    this.unsubscribeFromNowPlaying();
    this.emitStatus();
  }

  async stop(): Promise<void> {
    this.isIntentionallyStopped = true;
    this.isPlaying = false;
    this.reconnectAttempts = 0;
    this.bufferingStartedAt = 0;
    this.resetLockScreenCache();
    this.clearLockScreenTimeout();

    if (this.player) {
      try {
        this.player.pause();
        this.player.setActiveForLockScreen(false);
      } catch (e) {
        logger.error('Error deactivating lock screen:', e);
      }
      this.removePlayerListener();
      try {
        this.player.release();
      } catch (releaseError) {
        logger.error('Error releasing player:', releaseError);
      }
      this.player = null;
    }

    this.releaseWifiLock();
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
      this.player.volume = this.volume;
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
    this.clearLockScreenTimeout();
    this.clearReconnectTimeout();
    this.bufferingStartedAt = 0;
    this.resetLockScreenCache();

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

    if (this.player) {
      try {
        this.player.setActiveForLockScreen(false);
      } catch {
        // ignore
      }
    }

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
