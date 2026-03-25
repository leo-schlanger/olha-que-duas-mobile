import { useState, useEffect, useCallback } from 'react';
import {
  radioSettingsService,
  RadioSettings,
} from '../services/radioSettingsService';
import { logger } from '../utils/logger';

export function useRadioSettings() {
  const [settings, setSettings] = useState<RadioSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        const loaded = await radioSettingsService.load();
        if (mounted) {
          setSettings(loaded);
          setError(null);
        }
      } catch (err) {
        logger.error('Error loading radio settings:', err);
        if (mounted) {
          setError('Erro ao carregar configurações');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
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
      try {
        await radioSettingsService.updateSetting(key, value);
      } catch (err) {
        logger.error('Error updating radio setting:', err);
        throw err;
      }
    },
    []
  );

  const resetSettings = useCallback(async () => {
    try {
      await radioSettingsService.reset();
    } catch (err) {
      logger.error('Error resetting radio settings:', err);
      throw err;
    }
  }, []);

  return {
    settings,
    isLoading,
    error,
    updateSetting,
    resetSettings,
  };
}
