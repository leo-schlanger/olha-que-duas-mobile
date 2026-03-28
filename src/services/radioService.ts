import { setAudioModeAsync, AudioPlayer, createAudioPlayer } from 'expo-audio';
import { AppState, AppStateStatus } from 'react-native';
import { siteConfig } from '../config/site';
import { radioSettingsService, RadioSettings } from './radioSettingsService';
import { nowPlayingService } from './nowPlayingService';
import { logger } from '../utils/logger';

/**
 * Radio streaming service using expo-audio (2026)
 * Supports background playback and lock screen controls
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
  private readonly MAX_RECONNECT_ATTEMPTS: number = 10;
  private settings: RadioSettings | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private nowPlayingUnsubscribe: (() => void) | null = null;
  private isBuffering: boolean = false;
  private statusPollingInterval: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private lastAppState: AppStateStatus = 'active';
  private lockScreenTimeout: ReturnType<typeof setTimeout> | null = null;

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

  private stopStatusPolling() {
    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval);
      this.statusPollingInterval = null;
    }
  }

  private startStatusPolling() {
    this.stopStatusPolling();
    // Poll player status every 500ms as fallback for playbackStatusUpdate
    this.statusPollingInterval = setInterval(() => {
      this.pollPlayerStatus();
    }, 500);
  }

  private pollPlayerStatus() {
    // Double-check intentionally stopped to prevent race conditions
    if (!this.player || this.isIntentionallyStopped) {
      return;
    }

    try {
      // Read status directly from player properties (expo-audio SDK 54+)
      const playerPlaying = this.player.playing;
      const playerBuffering = this.player.isBuffering;

      // Re-check after reading player state (may have changed during read)
      if (this.isIntentionallyStopped) {
        return;
      }

      const wasPlaying = this.isPlaying;
      const wasBuffering = this.isBuffering;

      this.isPlaying = playerPlaying ?? false;
      this.isBuffering = playerBuffering ?? false;

      const isLoading = !this.isPlaying && !this.isIntentionallyStopped;

      if (wasPlaying !== this.isPlaying || wasBuffering !== this.isBuffering) {
        logger.log('Polling status:', { isPlaying: this.isPlaying, isBuffering: this.isBuffering });
        this.emitStatus(isLoading);
      }
    } catch (error) {
      logger.error('Error polling player status:', error);
    }
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load settings
      this.settings = await radioSettingsService.load();
      this.volume = this.settings.volume;

      // Subscribe to settings changes
      this.settingsUnsubscribe = radioSettingsService.subscribe((newSettings) => {
        this.handleSettingsChange(newSettings);
      });

      // Configure audio mode for background playback
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: this.settings.backgroundPlayback,
        interruptionMode: 'doNotMix',
      });

      // Setup AppState listener for app lifecycle events
      this.setupAppStateListener();

      this.isInitialized = true;
      logger.log('RadioService initialized with expo-audio');

      // Auto-play if enabled
      if (this.settings.autoPlayOnStart) {
        setTimeout(() => this.play(), 500);
      }
    } catch (error) {
      logger.error('Error initializing RadioService:', error);
      this.isInitialized = true;
    }
  }

  private setupAppStateListener(): void {
    this.lastAppState = AppState.currentState;
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    logger.log('AppState changed:', this.lastAppState, '->', nextAppState);

    // App coming back to active from background/inactive
    if (this.lastAppState.match(/inactive|background/) && nextAppState === 'active') {
      // Resume polling ONLY if playing AND not intentionally stopped
      // This prevents re-enabling polling after user paused in background
      if (this.isPlaying && !this.isIntentionallyStopped && !this.statusPollingInterval) {
        this.startStatusPolling();
      }
    }

    // App going to background
    if (nextAppState === 'background') {
      // Pause polling to save battery (lock screen doesn't need frequent updates)
      if (this.statusPollingInterval) {
        this.stopStatusPolling();
      }

      // If stopOnClose is enabled, stop the radio when app goes to background
      // Note: This handles the case when user swipes app from recent apps
      if (this.settings?.stopOnClose && this.isPlaying) {
        logger.log('Stopping radio due to stopOnClose setting');
        this.stop();
      }
    }

    this.lastAppState = nextAppState;
  };

  private async handleSettingsChange(newSettings: RadioSettings) {
    const oldSettings = this.settings;
    this.settings = newSettings;

    // Update volume in real-time
    if (oldSettings?.volume !== newSettings.volume) {
      this.volume = newSettings.volume;
      if (this.player) {
        this.player.volume = this.volume;
      }
    }

    // Update background playback mode in real-time
    if (oldSettings?.backgroundPlayback !== newSettings.backgroundPlayback) {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: newSettings.backgroundPlayback,
          interruptionMode: 'doNotMix',
        });
        logger.log('Background playback updated:', newSettings.backgroundPlayback);
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
    try {
      this.isIntentionallyStopped = false;
      this.clearReconnectTimeout();
      this.clearLockScreenTimeout();
      this.stopStatusPolling();
      this.emitStatus(true);

      if (!this.isInitialized) {
        await this.initialize();
      }

      // Release previous player if exists
      if (this.player) {
        // Deactivate lock screen before releasing to prevent orphan notifications
        try {
          this.player.setActiveForLockScreen(false);
        } catch (_e) {
          // Ignore if already released
        }
        this.removePlayerListener();
        this.player.release();
        this.player = null;
      }

      logger.log('Creating audio player for:', siteConfig.radio.streamUrl);

      // Create new player
      this.player = createAudioPlayer({ uri: siteConfig.radio.streamUrl });
      this.player.volume = this.volume;

      // Subscribe to status updates
      this.playerSubscription = this.player.addListener('playbackStatusUpdate', (status) => {
        this.handlePlaybackStatus(status);
      });

      // Start playback first
      this.player.play();

      // Enable lock screen controls after playback starts (avoid blocking)
      // Use remote URL for artwork as local file:// URIs may not work in release builds
      // Store timeout reference so it can be cancelled if pause/stop is called
      this.lockScreenTimeout = setTimeout(() => {
        this.lockScreenTimeout = null;
        if (this.player && !this.isIntentionallyStopped) {
          try {
            this.player.setActiveForLockScreen(true, {
              title: siteConfig.radio.name,
              artist: siteConfig.radio.tagline,
              artworkUrl: siteConfig.radio.logoUrl,
            });
          } catch (e) {
            logger.error('Error setting lock screen:', e);
          }
        }
      }, 200);

      // Subscribe to now-playing updates for lock screen metadata
      // Only subscribe if not already subscribed (prevents duplicate listeners on reconnect)
      if (!this.nowPlayingUnsubscribe) {
        this.subscribeToNowPlaying();
      }

      // Start polling as fallback for playbackStatusUpdate (which may not fire for live streams)
      this.startStatusPolling();

      // Don't set isPlaying = true here - wait for playbackStatusUpdate callback
      // or polling to confirm playback has actually started
      this.reconnectAttempts = 0;
      this.emitStatus(true); // Keep showing loading until confirmed

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
    // Ignore status updates if intentionally stopped (prevents race conditions)
    if (this.isIntentionallyStopped) {
      return;
    }

    if (status.error) {
      logger.error('Playback error:', status.error);
      this.isPlaying = false;
      this.isBuffering = false;
      this.emitStatus(false);

      if (!this.isIntentionallyStopped && this.settings?.autoReconnect) {
        this.reconnect();
      }
      return;
    }

    const wasPlaying = this.isPlaying;
    const wasBuffering = this.isBuffering;

    // expo-audio reports playing status
    this.isPlaying = status.isPlaying ?? status.playing ?? false;
    this.isBuffering = status.isBuffering ?? status.buffering ?? false;

    // Loading is finished when playback has started
    // We consider it playing if isPlaying is true, regardless of buffering
    const isLoading = !this.isPlaying && !this.isIntentionallyStopped;

    if (wasPlaying !== this.isPlaying || wasBuffering !== this.isBuffering) {
      logger.log('Playback status changed:', {
        isPlaying: this.isPlaying,
        isBuffering: this.isBuffering,
      });
      this.emitStatus(isLoading);
    }
  }

  private subscribeToNowPlaying() {
    if (this.nowPlayingUnsubscribe) {
      this.nowPlayingUnsubscribe();
    }

    // Start the now playing service polling
    nowPlayingService.start();

    this.nowPlayingUnsubscribe = nowPlayingService.subscribe((data) => {
      // Verificar se ainda estamos tocando antes de atualizar lock screen
      if (!this.player || this.isIntentionallyStopped) return;

      if (data.isMusic && data.song) {
        // Show song info with artwork from now-playing API, fallback to radio logo URL
        const artworkUrl = data.song.art || siteConfig.radio.logoUrl;
        logger.log('Updating lock screen metadata:', data.song.title, '-', data.song.artist);
        try {
          this.player.setActiveForLockScreen(true, {
            title: data.song.title,
            artist: data.song.artist,
            artworkUrl,
          });
        } catch (error) {
          logger.error('Error updating lock screen:', error);
        }
      } else {
        // Show radio name with logo when no song is playing
        try {
          this.player.setActiveForLockScreen(true, {
            title: siteConfig.radio.name,
            artist: siteConfig.radio.tagline,
            artworkUrl: siteConfig.radio.logoUrl,
          });
        } catch (error) {
          logger.error('Error updating lock screen:', error);
        }
      }
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
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.log('Max reconnect attempts reached, giving up');
      // Reset state so user can try again manually
      this.reconnectAttempts = 0;
      this.isPlaying = false;
      this.isIntentionallyStopped = true;
      this.stopStatusPolling();
      this.unsubscribeFromNowPlaying();
      this.emitStatus(false);
      return;
    }

    this.clearReconnectTimeout();

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
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
    // Set flag FIRST to prevent any polling/callbacks from restarting
    this.isIntentionallyStopped = true;
    this.isPlaying = false;
    this.reconnectAttempts = 0;

    // Cancel pending lock screen timeout
    this.clearLockScreenTimeout();

    // Pause player BEFORE stopping polling to ensure consistent state
    if (this.player) {
      try {
        this.player.pause();
      } catch (e) {
        logger.error('Error pausing player:', e);
      }
    }

    // Now safe to stop polling and cleanup
    this.clearReconnectTimeout();
    this.stopStatusPolling();

    // Clean up now playing subscription to prevent memory leaks
    this.unsubscribeFromNowPlaying();

    this.emitStatus();
  }

  async stop(): Promise<void> {
    // Set flags FIRST to prevent any polling/callbacks from restarting
    this.isIntentionallyStopped = true;
    this.isPlaying = false;
    this.reconnectAttempts = 0;

    // Cancel pending lock screen timeout
    this.clearLockScreenTimeout();

    // Stop player BEFORE cleanup
    if (this.player) {
      // Deactivate lock screen BEFORE releasing the player to remove notification
      try {
        this.player.pause();
        this.player.setActiveForLockScreen(false);
      } catch (e) {
        // Ignore error if player is already released
        logger.error('Error deactivating lock screen:', e);
      }
      this.removePlayerListener();
      this.player.release();
      this.player = null;
    }

    // Now safe to cleanup
    this.clearReconnectTimeout();
    this.stopStatusPolling();
    this.unsubscribeFromNowPlaying();

    this.emitStatus();
  }

  async setVolume(value: number): Promise<void> {
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
    // Clear all timeouts first
    this.clearLockScreenTimeout();
    this.clearReconnectTimeout();

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
    await this.stop();
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
