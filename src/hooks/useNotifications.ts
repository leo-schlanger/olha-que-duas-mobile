import { useState, useEffect, useCallback } from 'react';
import {
  notificationService,
  NotificationPreferences,
  ReminderTime,
} from '../services/notificationService';
import { logger } from '../utils/logger';

export function useNotifications() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    notificationService.getPreferences()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = notificationService.subscribe(setPreferences);

    // Check initial permission status
    notificationService.checkPermissions().then(setHasPermission);

    // Sincronizar com notificações do sistema ao montar
    notificationService.forceSync().catch((err) => {
      logger.error('Error syncing notifications:', err);
    });

    return unsubscribe;
  }, []);

  // Verifica se há operação em andamento no serviço
  const isOperationPending = useCallback(() => {
    return notificationService.isOperationPending();
  }, []);

  const setEnabled = useCallback(async (enabled: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      await notificationService.setEnabled(enabled);
      const permission = await notificationService.checkPermissions();
      setHasPermission(permission);
    } catch (err) {
      logger.error('Error setting notifications enabled:', err);
      setError('Erro ao atualizar notificações');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setReminderMinutes = useCallback(async (minutes: ReminderTime) => {
    setIsLoading(true);
    setError(null);
    try {
      await notificationService.setReminderMinutes(minutes);
    } catch (err) {
      logger.error('Error setting reminder minutes:', err);
      setError('Erro ao atualizar tempo de lembrete');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleShowReminder = useCallback(async (showName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await notificationService.toggleShowReminder(showName);
      const permission = await notificationService.checkPermissions();
      setHasPermission(permission);
      return result;
    } catch (err) {
      logger.error('Error toggling show reminder:', err);
      setError('Erro ao atualizar lembrete');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const scheduleReminder = useCallback(
    async (showName: string, dayOfWeek: number, time: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const notificationId = await notificationService.scheduleShowReminder(
          showName,
          dayOfWeek,
          time
        );
        const permission = await notificationService.checkPermissions();
        setHasPermission(permission);
        return notificationId;
      } catch (err) {
        logger.error('Error scheduling reminder:', err);
        setError('Erro ao agendar lembrete');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const cancelShowReminders = useCallback(async (showName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await notificationService.cancelShowNotifications(showName);
    } catch (err) {
      logger.error('Error cancelling show reminders:', err);
      setError('Erro ao cancelar lembretes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isShowEnabled = useCallback(
    (showName: string) => {
      return preferences.enabledShows.includes(showName);
    },
    [preferences.enabledShows]
  );

  const requestPermissions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const granted = await notificationService.requestPermissions();
      setHasPermission(granted);
      return granted;
    } catch (err) {
      logger.error('Error requesting permissions:', err);
      setError('Erro ao solicitar permissões');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const forceSync = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await notificationService.forceSync();
    } catch (err) {
      logger.error('Error forcing sync:', err);
      setError('Erro ao sincronizar notificações');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
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
    cancelShowReminders,
    isShowEnabled,
    requestPermissions,
    forceSync,
    isOperationPending,
    clearError,
  };
}
