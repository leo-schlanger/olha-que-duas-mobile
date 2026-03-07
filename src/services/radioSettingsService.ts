import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@olhaqueduas:radio_settings';

export interface RadioSettings {
  /** Enable background playback when screen is off - ACTIVE */
  backgroundPlayback: boolean;
  /** Auto-play radio when app opens - ACTIVE */
  autoPlayOnStart: boolean;
  /** Auto-reconnect on connection loss - ACTIVE */
  autoReconnect: boolean;
  /** Keep audio playing when app is killed (Android) - Managed by expo-audio natively */
  continueOnAppKill: boolean;
  /** Volume level (0-1) - ACTIVE */
  volume: number;
  /** Show persistent notification (Android) - Managed by expo-audio natively */
  showNotification: boolean;
  /** Audio quality preference - Reserved for future multi-bitrate support */
  audioQuality: 'high' | 'medium' | 'low';
}

const DEFAULT_SETTINGS: RadioSettings = {
  backgroundPlayback: true,
  autoPlayOnStart: false,
  autoReconnect: true,
  continueOnAppKill: true,
  volume: 1.0,
  showNotification: true,
  audioQuality: 'high',
};

class RadioSettingsService {
  private settings: RadioSettings = { ...DEFAULT_SETTINGS };
  private isLoaded: boolean = false;
  private listeners: Set<(settings: RadioSettings) => void> = new Set();

  /**
   * Load settings from storage
   */
  async load(): Promise<RadioSettings> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle new settings
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
      }
      this.isLoaded = true;
      return this.settings;
    } catch (error) {
      console.error('Error loading radio settings:', error);
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
      console.error('Error saving radio settings:', error);
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
  subscribe(listener: (settings: RadioSettings) => void): () => void {
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
