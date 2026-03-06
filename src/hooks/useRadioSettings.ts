import { useState, useEffect, useCallback } from 'react';
import {
  radioSettingsService,
  RadioSettings,
} from '../services/radioSettingsService';

export function useRadioSettings() {
  const [settings, setSettings] = useState<RadioSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      const loaded = await radioSettingsService.load();
      if (mounted) {
        setSettings(loaded);
        setIsLoading(false);
      }
    }

    loadSettings();

    // Subscribe to changes
    const unsubscribe = radioSettingsService.subscribe((newSettings) => {
      if (mounted) {
        setSettings(newSettings);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const updateSetting = useCallback(
    async <K extends keyof RadioSettings>(key: K, value: RadioSettings[K]) => {
      await radioSettingsService.updateSetting(key, value);
    },
    []
  );

  const resetSettings = useCallback(async () => {
    await radioSettingsService.reset();
  }, []);

  return {
    settings,
    isLoading,
    updateSetting,
    resetSettings,
  };
}
