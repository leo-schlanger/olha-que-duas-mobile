import {
  setAudioModeAsync,
  AudioPlayer,
  createAudioPlayer,
} from 'expo-audio';
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
  private onStatusChange: ((status: RadioStatus) => void) | null = null;
  private isIntentionallyStopped: boolean = true;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS: number = 10;
  private settings: RadioSettings | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private nowPlayingUnsubscribe: (() => void) | null = null;
  private isBuffering: boolean = false;

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private removePlayerListener() {
    if (this.playerSubscription) {
      this.playerSubscription.remove();
      this.playerSubscription = null;
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

  setStatusCallback(callback: (status: RadioStatus) => void) {
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
      this.emitStatus(true);

      if (!this.isInitialized) {
        await this.initialize();
      }

      // Release previous player if exists
      if (this.player) {
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

      // Enable lock screen controls (artwork will be added when now-playing data is available)
      this.player.setActiveForLockScreen(true, {
        title: siteConfig.radio.name,
        artist: siteConfig.radio.tagline,
      });

      // Subscribe to now-playing updates for lock screen metadata
      this.subscribeToNowPlaying();

      // Start playback
      this.player.play();

      // Don't set isPlaying = true here - wait for playbackStatusUpdate callback
      // to confirm playback has actually started
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

  private handlePlaybackStatus(status: any) {
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
      logger.log('Playback status changed:', { isPlaying: this.isPlaying, isBuffering: this.isBuffering });
      this.emitStatus(isLoading);
    }
  }

  private subscribeToNowPlaying() {
    if (this.nowPlayingUnsubscribe) {
      this.nowPlayingUnsubscribe();
    }

    this.nowPlayingUnsubscribe = nowPlayingService.subscribe((data) => {
      if (data.isMusic && data.song && this.player) {
        // Show song info with artwork from now-playing API
        const metadata: { title: string; artist: string; artwork?: string } = {
          title: data.song.title,
          artist: data.song.artist,
        };
        if (data.song.art) {
          metadata.artwork = data.song.art;
        }
        this.player.setActiveForLockScreen(true, metadata);
      } else if (this.player) {
        // Show radio name when no song is playing (system will use app icon)
        this.player.setActiveForLockScreen(true, {
          title: siteConfig.radio.name,
          artist: siteConfig.radio.tagline,
        });
      }
    });
  }

  private unsubscribeFromNowPlaying() {
    if (this.nowPlayingUnsubscribe) {
      this.nowPlayingUnsubscribe();
      this.nowPlayingUnsubscribe = null;
    }
  }

  private reconnect() {
    if (this.isIntentionallyStopped) return;
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.log('Max reconnect attempts reached');
      this.emitStatus();
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
    this.isIntentionallyStopped = true;
    this.clearReconnectTimeout();
    this.reconnectAttempts = 0;

    if (this.player) {
      this.player.pause();
    }

    this.isPlaying = false;
    this.emitStatus();
  }

  async stop(): Promise<void> {
    this.isIntentionallyStopped = true;
    this.clearReconnectTimeout();
    this.reconnectAttempts = 0;
    this.unsubscribeFromNowPlaying();

    if (this.player) {
      this.removePlayerListener();
      this.player.release();
      this.player = null;
    }

    this.isPlaying = false;
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
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
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
