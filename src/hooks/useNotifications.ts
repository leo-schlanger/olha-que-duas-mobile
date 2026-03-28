import { useState, useEffect, useCallback, useRef } from 'react';
import {
  notificationService,
  NotificationPreferences,
  ReminderTime,
} from '../services/notificationService';
import { logger } from '../utils/logger';

interface UseNotificationsReturn {
  preferences: NotificationPreferences;
  isLoading: boolean;
  hasPermission: boolean | null;
  error: string | null;
  setEnabled: (_enabled: boolean) => Promise<boolean>;
  setReminderMinutes: (_minutes: ReminderTime) => Promise<boolean>;
  toggleShowReminder: (_showName: string) => Promise<boolean>;
  scheduleReminder: (
    _showName: string,
    _dayOfWeek: number,
    _time: string
  ) => Promise<string | null>;
  scheduleAllTimesForShow: (
    _showName: string,
    _dayOfWeek: number,
    _times: string[]
  ) => Promise<boolean>;
  cancelShowReminders: (_showName: string) => Promise<boolean>;
  isShowEnabled: (_showName: string) => boolean;
  requestPermissions: () => Promise<boolean>;
  forceSync: () => Promise<void>;
  isOperationPending: () => boolean;
  clearError: () => void;
}

export function useNotifications(): UseNotificationsReturn {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    notificationService.getPreferences()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const unsubscribe = notificationService.subscribe((prefs) => {
      if (isMountedRef.current) {
        setPreferences(prefs);
      }
    });

    // Check initial permission status
    notificationService.checkPermissions().then((granted) => {
      if (isMountedRef.current) {
        setHasPermission(granted);
      }
    });

    // Initial sync
    notificationService.forceSync().catch((err) => {
      logger.error('Error syncing notifications:', err);
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const setEnabled = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (!isMountedRef.current) return false;

    setIsLoading(true);
    setError(null);

    try {
      const result = await notificationService.setEnabled(enabled);

      if (isMountedRef.current) {
        if (!result.success) {
          setError(result.error || 'Erro ao atualizar notificações');
        }
        const permission = await notificationService.checkPermissions();
        setHasPermission(permission);
      }

      return result.success;
    } catch (err) {
      if (isMountedRef.current) {
        logger.error('Error setting notifications enabled:', err);
        setError('Erro ao atualizar notificações');
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const setReminderMinutes = useCallback(async (minutes: ReminderTime): Promise<boolean> => {
    if (!isMountedRef.current) return false;

    setIsLoading(true);
    setError(null);

    try {
      const result = await notificationService.setReminderMinutes(minutes);

      if (isMountedRef.current && !result.success) {
        setError(result.error || 'Erro ao atualizar tempo de lembrete');
      }

      return result.success;
    } catch (err) {
      if (isMountedRef.current) {
        logger.error('Error setting reminder minutes:', err);
        setError('Erro ao atualizar tempo de lembrete');
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const toggleShowReminder = useCallback(async (showName: string): Promise<boolean> => {
    if (!isMountedRef.current) return false;

    setIsLoading(true);
    setError(null);

    try {
      const result = await notificationService.toggleShowReminder(showName);

      if (isMountedRef.current) {
        if (!result.success) {
          setError(result.error || 'Erro ao atualizar lembrete');
        }
        const permission = await notificationService.checkPermissions();
        setHasPermission(permission);
      }

      return result.success ? (result.data ?? false) : false;
    } catch (err) {
      if (isMountedRef.current) {
        logger.error('Error toggling show reminder:', err);
        setError('Erro ao atualizar lembrete');
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const scheduleReminder = useCallback(
    async (showName: string, dayOfWeek: number, time: string): Promise<string | null> => {
      if (!isMountedRef.current) return null;

      setIsLoading(true);
      setError(null);

      try {
        const result = await notificationService.scheduleShowReminder(showName, dayOfWeek, time);

        if (isMountedRef.current) {
          if (!result.success) {
            setError(result.error || 'Erro ao agendar lembrete');
          }
          const permission = await notificationService.checkPermissions();
          setHasPermission(permission);
        }

        return result.success ? (result.data ?? null) : null;
      } catch (err) {
        if (isMountedRef.current) {
          logger.error('Error scheduling reminder:', err);
          setError('Erro ao agendar lembrete');
        }
        return null;
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const scheduleAllTimesForShow = useCallback(
    async (showName: string, dayOfWeek: number, times: string[]): Promise<boolean> => {
      if (!isMountedRef.current) return false;

      setIsLoading(true);
      setError(null);

      try {
        const result = await notificationService.scheduleAllTimesForShow(
          showName,
          dayOfWeek,
          times
        );

        if (isMountedRef.current) {
          if (!result.success) {
            setError(result.error || 'Erro ao agendar lembretes');
          } else if (result.data && result.data.failed > 0) {
            setError(`${result.data.failed} lembrete(s) não foram agendados`);
          }
          const permission = await notificationService.checkPermissions();
          setHasPermission(permission);
        }

        return result.success;
      } catch (err) {
        if (isMountedRef.current) {
          logger.error('Error scheduling reminders:', err);
          setError('Erro ao agendar lembretes');
        }
        return false;
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const cancelShowReminders = useCallback(async (showName: string): Promise<boolean> => {
    if (!isMountedRef.current) return false;

    setIsLoading(true);
    setError(null);

    try {
      const result = await notificationService.cancelShowNotifications(showName);

      if (isMountedRef.current && !result.success) {
        setError(result.error || 'Erro ao cancelar lembretes');
      }

      return result.success;
    } catch (err) {
      if (isMountedRef.current) {
        logger.error('Error cancelling show reminders:', err);
        setError('Erro ao cancelar lembretes');
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const isShowEnabled = useCallback(
    (showName: string): boolean => {
      return preferences.enabledShows.includes(showName);
    },
    [preferences.enabledShows]
  );

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (!isMountedRef.current) return false;

    setIsLoading(true);
    setError(null);

    try {
      const granted = await notificationService.requestPermissions();

      if (isMountedRef.current) {
        setHasPermission(granted);
        if (!granted) {
          setError('Permissão de notificações não concedida');
        }
      }

      return granted;
    } catch (err) {
      if (isMountedRef.current) {
        logger.error('Error requesting permissions:', err);
        setError('Erro ao solicitar permissões');
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const forceSync = useCallback(async (): Promise<void> => {
    if (!isMountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      await notificationService.forceSync();
    } catch (err) {
      if (isMountedRef.current) {
        logger.error('Error forcing sync:', err);
        setError('Erro ao sincronizar notificações');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const isOperationPending = useCallback((): boolean => {
    return notificationService.isOperationPending();
  }, []);

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  return {
    preferences,
    isLoading,
    hasPermission,
    error,
    setEnabled,
    setReminderMinutes,
    toggleShowReminder,
    scheduleReminder,
    scheduleAllTimesForShow,
    cancelShowReminders,
    isShowEnabled,
    requestPermissions,
    forceSync,
    isOperationPending,
    clearError,
  };
}
