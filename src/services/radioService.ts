import TrackPlayer, {
  Capability,
  State,
  Event,
  AppKilledPlaybackBehavior,
  IOSCategory,
  IOSCategoryMode,
  IOSCategoryOptions,
} from 'react-native-track-player';
import { Platform } from 'react-native';
import { siteConfig } from '../config/site';
import { radioSettingsService, RadioSettings } from './radioSettingsService';

/**
 * Professional Radio streaming service with background audio support
 * Uses react-native-track-player for proper foreground service on Android
 * and background audio on iOS
 */
class RadioService {
  private isInitialized: boolean = false;
  private isPlaying: boolean = false;
  private volume: number = 1.0;
  private onStatusChange: ((status: RadioStatus) => void) | null = null;
  private isIntentionallyStopped: boolean = true;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_DELAY: number = 30000;
  private readonly MAX_RECONNECT_ATTEMPTS: number = 10;
  private settings: RadioSettings | null = null;
  private settingsUnsubscribe: (() => void) | null = null;

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Initialize TrackPlayer for professional radio streaming
   * Sets up the player with proper notification and capabilities
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load settings first
      this.settings = await radioSettingsService.load();
      this.volume = this.settings.volume;

      // Subscribe to settings changes
      this.settingsUnsubscribe = radioSettingsService.subscribe((newSettings) => {
        this.handleSettingsChange(newSettings);
      });

      // Determine app killed behavior based on settings
      const appKilledBehavior = this.settings.continueOnAppKill
        ? AppKilledPlaybackBehavior.ContinuePlayback
        : AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification;

      // Check if player is already set up (can happen on app restart)
      let playerAlreadySetup = false;
      try {
        await TrackPlayer.getPlaybackState();
        playerAlreadySetup = true;
        console.log('TrackPlayer already initialized');
      } catch {
        // Player not initialized, will set it up
        playerAlreadySetup = false;
      }

      if (!playerAlreadySetup) {
        // Configure player with platform-specific options for background playback
        const playerOptions: any = {
          autoHandleInterruptions: true,
          // Buffer configuration for stable streaming
          minBuffer: 15, // Minimum buffer in seconds
          maxBuffer: 50, // Maximum buffer in seconds
          playBuffer: 2.5, // Buffer before playback starts
          backBuffer: 0, // No back buffer needed for live stream
        };

        // iOS-specific configuration for background audio
        if (Platform.OS === 'ios') {
          playerOptions.iosCategory = IOSCategory.Playback;
          playerOptions.iosCategoryMode = IOSCategoryMode.Default;
          playerOptions.iosCategoryOptions = [
            IOSCategoryOptions.AllowBluetooth,
            IOSCategoryOptions.AllowBluetoothA2DP,
            IOSCategoryOptions.AllowAirPlay,
          ];
        }

        await TrackPlayer.setupPlayer(playerOptions);
        console.log('TrackPlayer setup completed');
      }

      await TrackPlayer.updateOptions({
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
        ],
        compactCapabilities: [
          Capability.Play,
          Capability.Pause,
        ],
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
        ],
        // Android specific options for background playback
        android: {
          appKilledPlaybackBehavior: appKilledBehavior,
          alwaysPauseOnInterruption: false,
          // Keep foreground service for 5 seconds after pause
          stopForegroundGracePeriod: 5,
        },
        // Progress update for notification
        progressUpdateEventInterval: 2,
      });
      console.log('TrackPlayer options updated');

      // Listen to playback state changes
      TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
        this.handlePlaybackState(event.state);
      });

      // Listen for playback errors
      TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
        console.error('Playback error:', event);
        if (!this.isIntentionallyStopped && this.settings?.autoReconnect) {
          this.reconnect();
        }
      });

      // Listen for active track changes
      TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
        if (!event.track && !this.isIntentionallyStopped && this.isPlaying) {
          console.log('Track was removed unexpectedly, reconnecting...');
          if (this.settings?.autoReconnect) {
            this.reconnect();
          }
        }
      });

      // Listen for track ending (shouldn't happen with live stream, but handle it)
      TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
        if (!this.isIntentionallyStopped && this.isPlaying) {
          console.log('Stream ended unexpectedly, reconnecting...');
          if (this.settings?.autoReconnect) {
            this.reconnect();
          }
        }
      });

      this.isInitialized = true;
      console.log('RadioService initialized with professional streaming configuration');

      // Auto-play if enabled
      if (this.settings.autoPlayOnStart) {
        setTimeout(() => this.play(), 500);
      }
    } catch (error) {
      console.error('Error initializing TrackPlayer:', error);
      // Player might already be initialized
      this.isInitialized = true;
    }
  }

  /**
   * Handle settings changes dynamically
   */
  private async handleSettingsChange(newSettings: RadioSettings) {
    const oldSettings = this.settings;
    this.settings = newSettings;

    // Update volume if changed
    if (oldSettings?.volume !== newSettings.volume) {
      this.volume = newSettings.volume;
      try {
        await TrackPlayer.setVolume(this.volume);
      } catch (error) {
        console.error('Error updating volume:', error);
      }
    }

    // Update app killed behavior if changed
    if (oldSettings?.continueOnAppKill !== newSettings.continueOnAppKill) {
      try {
        await TrackPlayer.updateOptions({
          android: {
            appKilledPlaybackBehavior: newSettings.continueOnAppKill
              ? AppKilledPlaybackBehavior.ContinuePlayback
              : AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          },
        });
      } catch (error) {
        console.error('Error updating app killed behavior:', error);
      }
    }
  }

  /**
   * Handle playback state changes from TrackPlayer
   */
  private handlePlaybackState(state: State) {
    const wasPlaying = this.isPlaying;
    let isLoading = false;

    switch (state) {
      case State.Playing:
        this.isPlaying = true;
        this.reconnectAttempts = 0; // Reset reconnect counter on successful play
        break;
      case State.Paused:
      case State.Stopped:
      case State.None:
        this.isPlaying = false;
        break;
      case State.Buffering:
      case State.Loading:
        isLoading = true;
        // Keep current state while loading
        break;
      case State.Error:
        this.isPlaying = false;
        if (!this.isIntentionallyStopped && this.settings?.autoReconnect) {
          this.reconnect();
        }
        break;
    }

    if (wasPlaying !== this.isPlaying || isLoading) {
      this.emitStatus(isLoading);
    }
  }

  /**
   * Set callback for status updates
   */
  setStatusCallback(callback: (status: RadioStatus) => void) {
    this.onStatusChange = callback;
  }

  private emitStatus(isLoading: boolean = false) {
    if (this.onStatusChange) {
      this.onStatusChange({
        isPlaying: this.isPlaying,
        volume: this.volume,
        isLoading,
        isReconnecting: this.reconnectAttempts > 0,
        reconnectAttempt: this.reconnectAttempts,
      });
    }
  }

  /**
   * Get the stream URL based on quality settings
   */
  private getStreamUrl(): string {
    // For now, return the main stream URL
    // In the future, this could return different quality streams
    const baseUrl = siteConfig.radio.streamUrl;

    // If multiple quality options are available, select based on setting
    // Example: baseUrl.replace('radio.mp3', `radio_${quality}.mp3`)
    return baseUrl;
  }

  /**
   * Start playing the radio stream
   */
  async play(): Promise<boolean> {
    try {
      // Check if background playback is enabled
      if (!this.settings?.backgroundPlayback) {
        console.log('Background playback is disabled');
      }

      this.isIntentionallyStopped = false;
      this.clearReconnectTimeout();

      // Ensure player is initialized
      if (!this.isInitialized) {
        await this.initialize();
      }

      const currentTrack = await TrackPlayer.getActiveTrack();

      if (currentTrack) {
        // Track already loaded, just play
        await TrackPlayer.play();
      } else {
        const streamUrl = this.getStreamUrl();
        console.log('Adding radio track to player:', streamUrl);

        await TrackPlayer.reset();
        await TrackPlayer.add({
          id: 'radio-stream',
          url: streamUrl,
          title: siteConfig.radio.name,
          artist: siteConfig.radio.tagline,
          // Use artwork from config for notification display
          artwork: siteConfig.radio.artworkUrl,
          isLiveStream: true,
          // Additional metadata for better notification display
          duration: 0, // Live stream has no duration
          contentType: 'audio/mpeg',
        });

        console.log('Track added successfully, calling play()');
        await TrackPlayer.play();
      }

      // Apply volume
      await TrackPlayer.setVolume(this.volume);

      this.isPlaying = true;
      this.emitStatus();
      return true;
    } catch (error) {
      console.error('Error playing radio:', error);
      if (!this.isIntentionallyStopped && this.settings?.autoReconnect) {
        this.reconnect();
      }
      return false;
    }
  }

  /**
   * Pause audio playback
   */
  async pause(): Promise<void> {
    this.isIntentionallyStopped = true;
    this.clearReconnectTimeout();
    this.reconnectAttempts = 0;
    this.isPlaying = false;
    this.emitStatus();

    try {
      await TrackPlayer.pause();
    } catch (error) {
      console.error('Error pausing:', error);
    }
  }

  /**
   * Stop and reset the player
   */
  async stop(): Promise<void> {
    this.isIntentionallyStopped = true;
    this.clearReconnectTimeout();
    this.reconnectAttempts = 0;
    this.isPlaying = false;
    this.emitStatus();

    try {
      await TrackPlayer.stop();
      await TrackPlayer.reset();
    } catch (error) {
      console.error('Error stopping:', error);
    }
  }

  /**
   * Set volume level (0 to 1)
   */
  async setVolume(value: number): Promise<void> {
    this.volume = Math.max(0, Math.min(1, value));

    // Save to settings
    if (this.settings) {
      await radioSettingsService.updateSetting('volume', this.volume);
    }

    try {
      await TrackPlayer.setVolume(this.volume);
      this.emitStatus();
    } catch (error) {
      console.error('Error setting volume:', error);
    }
  }

  /**
   * Toggle between play and pause
   */
  async togglePlayPause(): Promise<boolean> {
    if (this.isPlaying) {
      await this.pause();
      return false;
    } else {
      return await this.play();
    }
  }

  /**
   * Get current playback status
   */
  getStatus(): RadioStatus {
    return {
      isPlaying: this.isPlaying,
      volume: this.volume,
      isLoading: false,
      isReconnecting: this.reconnectAttempts > 0,
      reconnectAttempt: this.reconnectAttempts,
    };
  }

  /**
   * Get current settings
   */
  getSettings(): RadioSettings | null {
    return this.settings;
  }

  /**
   * Attempt to reconnect to stream after error or disconnect
   * Uses exponential backoff: 1s, 2s, 4s, 8s, ... up to 30s
   */
  private reconnect() {
    if (this.isIntentionallyStopped) return;
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.log('Max reconnect attempts reached, stopping...');
      this.isPlaying = false;
      this.emitStatus();
      return;
    }

    this.clearReconnectTimeout();

    // Calculate delay with exponential backoff
    const baseDelay = 1000;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempts),
      this.MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts++;

    console.log(`Reconnecting to stream in ${delay}ms (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);
    this.emitStatus(true); // Emit loading status

    this.reconnectTimeout = setTimeout(async () => {
      if (!this.isIntentionallyStopped) {
        try {
          await TrackPlayer.reset();
          await this.play();
        } catch (error) {
          console.error('Reconnect failed:', error);
          // Will trigger another reconnect via error handler
        }
      }
    }, delay);
  }

  /**
   * Force reconnect (useful for user-initiated retry)
   */
  async forceReconnect(): Promise<boolean> {
    this.reconnectAttempts = 0;
    this.clearReconnectTimeout();

    try {
      await TrackPlayer.reset();
      return await this.play();
    } catch (error) {
      console.error('Force reconnect failed:', error);
      return false;
    }
  }

  /**
   * Check if radio service is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Cleanup resources on unmount
   */
  async cleanup() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
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

// Singleton instance
export const radioService = new RadioService();
