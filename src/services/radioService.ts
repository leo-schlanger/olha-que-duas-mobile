import { setAudioModeAsync, AudioPlayer, createAudioPlayer } from 'expo-audio';
import { AppState, AppStateStatus } from 'react-native';
import { type EventSubscription } from 'expo-modules-core';
import { siteConfig } from '../config/site';
import { radioSettingsService, RadioSettings } from './radioSettingsService';
import { nowPlayingService } from './nowPlayingService';
import { getLogoUri } from '../utils/artworkCache';
import * as ExpoMediaSession from '../../modules/expo-media-session/src';
import { logger } from '../utils/logger';
import { TIMING, LIMITS } from '../config/constants';

/**
 * Radio streaming service using expo-audio for playback and a custom
 * ExpoMediaSession native module for the lock-screen / notification.
 *
 * expo-audio handles audio streaming only (no setActiveForLockScreen).
 * ExpoMediaSession manages MediaSessionCompat + MediaStyle notification
 * with artwork loaded directly as a Bitmap from local file:// URIs —
 * bypassing the java.net.URL.equals() bug in expo-audio's native code.
 */
class RadioService {
  private player: AudioPlayer | null = null;
  private playerEventSubscription: { remove: () => void } | null = null;
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
  private appStateEventSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private lastAppState: AppStateStatus = 'active';
  private bufferingStartedAt: number = 0;
  private backgroundTransitionAt: number = 0;

  // Track last metadata sent to the native module to skip redundant updates
  private lastMediaMeta: string = '';

  // EventSubscriptions for remote commands from the native MediaSession
  private remotePlaySub: EventSubscription | null = null;
  private remotePauseSub: EventSubscription | null = null;
  private remoteStopSub: EventSubscription | null = null;
  private mediaSessionActive: boolean = false;

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private removePlayerListener() {
    if (this.playerEventSubscription) {
      this.playerEventSubscription.remove();
      this.playerEventSubscription = null;
    }
  }

  /**
   * Update the native media notification with new metadata.
   * Artwork is always a local file:// URI (from artworkCache).
   */
  private updateMediaNotification(meta: { title: string; artist: string; artworkUri: string }) {
    if (!this.mediaSessionActive || this.isIntentionallyStopped) return;
    const key = `${meta.title}\x00${meta.artist}\x00${meta.artworkUri}`;
    if (key === this.lastMediaMeta) return;
    this.lastMediaMeta = key;
    try {
      ExpoMediaSession.updateMetadata(meta);
    } catch (error) {
      logger.error('Error updating media notification:', error);
    }
  }

  private resetMediaMetaCache() {
    this.lastMediaMeta = '';
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

      // Detect external resume (e.g., user pressed play on notification)
      if (this.isIntentionallyStopped && playerPlaying) {
        logger.log('Polling: External resume detected');
        this.isIntentionallyStopped = false;
        this.isPlaying = true;
        this.isBuffering = playerBuffering;
        this.bufferingStartedAt = 0;
        this.subscribeToNowPlaying();
        if (this.mediaSessionActive) {
          ExpoMediaSession.updatePlaybackState(true);
        }
        this.emitStatus(false);
        return;
      }

      if (this.isIntentionallyStopped) return;

      // Detect external pause — suppress in background (reconcile on foreground return)
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
        if (this.mediaSessionActive) {
          ExpoMediaSession.updatePlaybackState(false);
        }
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
      this.setupRemoteCommandListeners();

      this.isInitialized = true;
      logger.log('RadioService initialized');

      if (this.settings.autoPlayOnStart) {
        setTimeout(() => this.play(), TIMING.RADIO_AUTOPLAY_DELAY);
      }
    } catch (error) {
      logger.error('Error initializing RadioService:', error);
    }
  }

  /**
   * Subscribe to play/pause/stop commands from the native MediaSession.
   * These fire when the user taps notification buttons, lock screen controls,
   * or Bluetooth media keys.
   */
  private setupRemoteCommandListeners(): void {
    this.remotePlaySub = ExpoMediaSession.addOnRemotePlayListener(() => {
      logger.log('Remote command: play');
      if (this.isIntentionallyStopped) {
        this.play();
      } else if (this.player && !this.player.playing) {
        this.player.play();
        this.isPlaying = true;
        this.isIntentionallyStopped = false;
        this.subscribeToNowPlaying();
        this.emitStatus(false);
      }
    });

    this.remotePauseSub = ExpoMediaSession.addOnRemotePauseListener(() => {
      logger.log('Remote command: pause');
      this.pause();
    });

    this.remoteStopSub = ExpoMediaSession.addOnRemoteStopListener(() => {
      logger.log('Remote command: stop');
      this.stop();
    });
  }

  private setupAppStateListener(): void {
    this.lastAppState = AppState.currentState;
    this.appStateEventSubscription = AppState.addEventListener('change', this.handleAppStateChange);
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
          if (this.mediaSessionActive) {
            ExpoMediaSession.updatePlaybackState(false);
          }
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
          // Activate media session if not already active
          if (!this.mediaSessionActive) {
            this.activateMediaSession();
          } else {
            ExpoMediaSession.updatePlaybackState(true);
          }
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
          this.resetMediaMetaCache();
        }
      }

      // SLOW PATH — create new player
      logger.log('Creating audio player for:', siteConfig.radio.streamUrl);

      this.player = createAudioPlayer({ uri: siteConfig.radio.streamUrl });
      this.player.volume = this.volume;

      this.playerEventSubscription = this.player.addListener('playbackStatusUpdate', (status) => {
        this.handlePlaybackStatus(status);
      });

      this.player.play();

      // Activate our custom media notification (replaces setActiveForLockScreen)
      this.activateMediaSession();

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

  /**
   * Start the native foreground service with initial metadata (radio name + logo).
   * The service creates the MediaSession, acquires WiFi lock, and shows the
   * notification. Subsequent metadata updates go via updateMediaNotification().
   */
  private activateMediaSession(): void {
    const logoUri = getLogoUri(siteConfig.radio.logoUrl);
    try {
      ExpoMediaSession.activate({
        title: siteConfig.radio.name,
        artist: siteConfig.radio.tagline,
        artworkUri: logoUri,
      });
      this.mediaSessionActive = true;
      this.resetMediaMetaCache();
    } catch (error) {
      logger.error('Error activating media session:', error);
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
      const inGracePeriod = Date.now() - this.backgroundTransitionAt < TIMING.RADIO_BG_GRACE_PERIOD;
      if (appInBackground || inGracePeriod) {
        return;
      }
      logger.log('External pause detected (lock screen or system)');
      this.isIntentionallyStopped = true;
      this.isPlaying = false;
      this.isBuffering = false;
      this.bufferingStartedAt = 0;
      this.unsubscribeFromNowPlaying();
      if (this.mediaSessionActive) {
        ExpoMediaSession.updatePlaybackState(false);
      }
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
      if (!this.mediaSessionActive || this.isIntentionallyStopped) return;

      // Resolve artwork: prefer pre-downloaded local file, then cached,
      // then fall back to the radio logo (always a local file).
      const fallbackLogo = getLogoUri(siteConfig.radio.logoUrl);
      const artUri = data.localArtUri || fallbackLogo;

      switch (data.mode) {
        case 'music':
          if (data.song) {
            this.updateMediaNotification({
              title: data.song.title,
              artist: data.song.artist,
              artworkUri: artUri,
            });
            return;
          }
          break;
        case 'liveShow':
          this.updateMediaNotification({
            title: data.liveShowName || siteConfig.radio.name,
            artist: siteConfig.radio.name,
            artworkUri: fallbackLogo,
          });
          return;
        case 'podcast':
          this.updateMediaNotification({
            title: data.podcastName,
            artist: siteConfig.radio.name,
            artworkUri: artUri,
          });
          return;
        case 'announcement':
          this.updateMediaNotification({
            title: data.announcementName,
            artist: siteConfig.radio.name,
            artworkUri: artUri,
          });
          return;
      }

      // Idle — fall back to radio identity
      this.updateMediaNotification({
        title: siteConfig.radio.name,
        artist: siteConfig.radio.tagline,
        artworkUri: fallbackLogo,
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
      this.deactivateMediaSession();
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

    if (this.mediaSessionActive) {
      ExpoMediaSession.updatePlaybackState(false);
    }

    this.emitStatus();
  }

  async stop(): Promise<void> {
    this.isIntentionallyStopped = true;
    this.isPlaying = false;
    this.reconnectAttempts = 0;
    this.bufferingStartedAt = 0;
    this.resetMediaMetaCache();

    // Release player
    if (this.player) {
      try {
        this.player.pause();
      } catch (e) {
        logger.error('Error pausing player:', e);
      }
      this.removePlayerListener();
      try {
        this.player.release();
      } catch (releaseError) {
        logger.error('Error releasing player:', releaseError);
      }
      this.player = null;
    }

    // Stop the native media service (notification + WiFi lock + MediaSession)
    this.deactivateMediaSession();

    this.clearReconnectTimeout();
    this.stopStatusPolling();
    this.unsubscribeFromNowPlaying();

    this.emitStatus();
  }

  private deactivateMediaSession(): void {
    if (!this.mediaSessionActive) return;
    try {
      ExpoMediaSession.deactivate();
    } catch (error) {
      logger.error('Error deactivating media session:', error);
    }
    this.mediaSessionActive = false;
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
    this.clearReconnectTimeout();
    this.bufferingStartedAt = 0;
    this.resetMediaMetaCache();

    if (this.appStateEventSubscription) {
      this.appStateEventSubscription.remove();
      this.appStateEventSubscription = null;
    }
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }

    // Remove remote command listeners
    this.remotePlaySub?.remove();
    this.remotePauseSub?.remove();
    this.remoteStopSub?.remove();
    this.remotePlaySub = null;
    this.remotePauseSub = null;
    this.remoteStopSub = null;

    this.stopStatusPolling();
    this.unsubscribeFromNowPlaying();

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
