import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { siteConfig } from '../config/site';

/**
 * Radio streaming service with background audio support
 * Handles audio playback, volume control, and automatic reconnection
 */
class RadioService {
  private sound: Audio.Sound | null = null;
  private isPlaying: boolean = false;
  private volume: number = 1.0;
  private onStatusChange: ((status: RadioStatus) => void) | null = null;
  private isIntentionallyStopped: boolean = true;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private async destroySound() {
    if (this.sound) {
      try {
        const soundToDestroy = this.sound;
        this.sound = null;
        await soundToDestroy.stopAsync();
        await soundToDestroy.unloadAsync();
      } catch (e) {
        console.error('Error destroying sound:', e);
      }
    }
  }

  /**
   * Initialize audio mode for background playback
   * This is critical for audio to continue when device is locked
   */
  async initialize() {
    try {
      await Audio.setAudioModeAsync({
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
      console.log('RadioService initialized');
    } catch (error) {
      console.error('Error initializing audio mode:', error);
    }
  }

  /**
   * Set callback for status updates
   */
  setStatusCallback(callback: (status: RadioStatus) => void) {
    this.onStatusChange = callback;
  }

  private emitStatus() {
    if (this.onStatusChange) {
      this.onStatusChange({
        isPlaying: this.isPlaying,
        volume: this.volume,
        isLoading: false,
      });
    }
  }

  /**
   * Start playing the radio stream
   */
  async play(): Promise<boolean> {
    try {
      this.isIntentionallyStopped = false;
      this.clearReconnectTimeout();

      if (this.sound) {
        await this.sound.playAsync();
        this.isPlaying = true;
        this.emitStatus();
        return true;
      }

      // Create new sound instance with stream URL
      const { sound } = await Audio.Sound.createAsync(
        { uri: siteConfig.radio.streamUrl },
        {
          shouldPlay: true,
          volume: this.volume,
          isLooping: false,
        },
        this.onPlaybackStatusUpdate.bind(this)
      );

      this.sound = sound;
      this.isPlaying = true;
      this.emitStatus();
      return true;
    } catch (error) {
      console.error('Error playing radio:', error);
      // Let reconnect handle errors if it's not intentionally stopped
      if (!this.isIntentionallyStopped) {
        this.reconnect();
      }
      return false;
    }
  }

  /**
   * Pause audio playback (Acts as Stop for Live streams)
   */
  async pause(): Promise<void> {
    this.isIntentionallyStopped = true;
    this.clearReconnectTimeout();
    this.isPlaying = false;
    this.emitStatus();
    await this.destroySound();
  }

  /**
   * Stop and unload audio
   */
  async stop(): Promise<void> {
    await this.pause();
  }

  /**
   * Set volume level (0 to 1)
   */
  async setVolume(value: number): Promise<void> {
    this.volume = Math.max(0, Math.min(1, value));
    try {
      if (this.sound) {
        await this.sound.setVolumeAsync(this.volume);
      }
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
    };
  }

  /**
   * Handle playback status updates from expo-av
   */
  private onPlaybackStatusUpdate(status: any) {
    if (status.isLoaded) {
      // In a live stream, didJustFinish means it unexpectedly dropped
      if (status.didJustFinish && !this.isIntentionallyStopped) {
        console.log('Stream ended, attempting to reconnect...');
        this.reconnect();
      } else {
        this.isPlaying = status.isPlaying;
      }
    } else if (status.error && !this.isIntentionallyStopped) {
      console.error('Playback error:', status.error);
      this.reconnect();
    }

    this.emitStatus();
  }

  /**
   * Attempt to reconnect to stream after error or disconnect
   */
  private reconnect() {
    if (this.isIntentionallyStopped) return;

    console.log('Reconnecting to stream...');
    this.clearReconnectTimeout();

    this.destroySound().then(() => {
      this.reconnectTimeout = setTimeout(() => {
        if (!this.isIntentionallyStopped) {
          this.play();
        }
      }, 5000);
    });
  }

  /**
   * Cleanup resources on unmount
   */
  async cleanup() {
    await this.stop();
  }
}

export interface RadioStatus {
  isPlaying: boolean;
  volume: number;
  isLoading: boolean;
}

// Singleton instance
export const radioService = new RadioService();
