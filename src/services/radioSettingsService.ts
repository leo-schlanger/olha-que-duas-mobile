import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const STORAGE_KEY = '@olhaqueduas:radio_settings';

export interface RadioSettings {
  /** Enable background playback when screen is off */
  backgroundPlayback: boolean;
  /** Auto-play radio when app opens */
  autoPlayOnStart: boolean;
  /** Auto-reconnect on connection loss */
  autoReconnect: boolean;
  /** Volume level (0-1) */
  volume: number;
  /** Stop radio when app is closed (swipe from recent apps) */
  stopOnClose: boolean;
}

// stopOnClose:false by default so a fresh install honours backgroundPlayback
// out of the box — pressing Home / locking the screen keeps the radio playing.
// The native plugin `withStopAudioOnTaskRemoved` still handles the
// swipe‑to‑kill case at the Android service level, so the user can stop
// playback by swiping the app away from recents. Existing users keep their
// chosen value: `load()` does `{ ...DEFAULT_SETTINGS, ...stored }`.
const DEFAULT_SETTINGS: RadioSettings = {
  backgroundPlayback: true,
  autoPlayOnStart: false,
  autoReconnect: true,
  volume: 1.0,
  stopOnClose: false,
};

class RadioSettingsService {
  private settings: RadioSettings = { ...DEFAULT_SETTINGS };
  private isLoaded: boolean = false;
  private listeners: Set<(_settings: RadioSettings) => void> = new Set();

  /**
   * Load settings from storage
   */
  async load(): Promise<RadioSettings> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(stored);
        } catch (parseError) {
          // Storage payload is corrupted — reset to defaults so the app can recover
          logger.error('Corrupted radio settings in storage, resetting:', parseError);
          await AsyncStorage.removeItem(STORAGE_KEY);
          this.isLoaded = true;
          return this.settings;
        }
        if (parsed && typeof parsed === 'object') {
          // Merge with defaults to handle new settings
          this.settings = { ...DEFAULT_SETTINGS, ...(parsed as Partial<RadioSettings>) };
        }
      }
      this.isLoaded = true;
      return this.settings;
    } catch (error) {
      logger.error('Error loading radio settings:', error);
      this.isLoaded = true;
      return this.settings;
    }
  }

  /**
   * Save settings to storage
   */
  async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      this.notifyListeners();
    } catch (error) {
      logger.error('Error saving radio settings:', error);
    }
  }

  /**
   * Get current settings
   */
  get(): RadioSettings {
    return { ...this.settings };
  }

  /**
   * Get a specific setting
   */
  getSetting<K extends keyof RadioSettings>(key: K): RadioSettings[K] {
    return this.settings[key];
  }

  /**
   * Update a single setting
   */
  async updateSetting<K extends keyof RadioSettings>(
    key: K,
    value: RadioSettings[K]
  ): Promise<void> {
    this.settings[key] = value;
    await this.save();
  }

  /**
   * Update multiple settings at once
   */
  async updateSettings(partial: Partial<RadioSettings>): Promise<void> {
    this.settings = { ...this.settings, ...partial };
    await this.save();
  }

  /**
   * Reset to default settings
   */
  async reset(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS };
    await this.save();
  }

  /**
   * Subscribe to settings changes
   */
  subscribe(listener: (_settings: RadioSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    const currentSettings = this.get();
    this.listeners.forEach((listener) => listener(currentSettings));
  }

  /**
   * Check if settings have been loaded
   */
  isReady(): boolean {
    return this.isLoaded;
  }
}

// Singleton instance
export const radioSettingsService = new RadioSettingsService();
