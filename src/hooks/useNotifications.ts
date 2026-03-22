import { useState, useEffect, useCallback } from 'react';
import {
  notificationService,
  NotificationPreferences,
  ReminderTime,
} from '../services/notificationService';

export function useNotifications() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    notificationService.getPreferences()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = notificationService.subscribe(setPreferences);

    // Check initial permission status
    notificationService.checkPermissions().then(setHasPermission);

    return unsubscribe;
  }, []);

  const setEnabled = useCallback(async (enabled: boolean) => {
    setIsLoading(true);
    await notificationService.setEnabled(enabled);
    const permission = await notificationService.checkPermissions();
    setHasPermission(permission);
    setIsLoading(false);
  }, []);

  const setReminderMinutes = useCallback(async (minutes: ReminderTime) => {
    setIsLoading(true);
    await notificationService.setReminderMinutes(minutes);
    setIsLoading(false);
  }, []);

  const toggleShowReminder = useCallback(async (showName: string) => {
    setIsLoading(true);
    const result = await notificationService.toggleShowReminder(showName);
    const permission = await notificationService.checkPermissions();
    setHasPermission(permission);
    setIsLoading(false);
    return result;
  }, []);

  const scheduleReminder = useCallback(
    async (showName: string, dayOfWeek: number, time: string) => {
      setIsLoading(true);
      const notificationId = await notificationService.scheduleShowReminder(
        showName,
        dayOfWeek,
        time
      );
      const permission = await notificationService.checkPermissions();
      setHasPermission(permission);
      setIsLoading(false);
      return notificationId;
    },
    []
  );

  const cancelShowReminders = useCallback(async (showName: string) => {
    setIsLoading(true);
    await notificationService.cancelShowNotifications(showName);
    setIsLoading(false);
  }, []);

  const isShowEnabled = useCallback(
    (showName: string) => {
      return preferences.enabledShows.includes(showName);
    },
    [preferences.enabledShows]
  );

  const requestPermissions = useCallback(async () => {
    setIsLoading(true);
    const granted = await notificationService.requestPermissions();
    setHasPermission(granted);
    setIsLoading(false);
    return granted;
  }, []);

  return {
    preferences,
    isLoading,
    hasPermission,
    setEnabled,
    setReminderMinutes,
    toggleShowReminder,
    scheduleReminder,
    cancelShowReminders,
    isShowEnabled,
    requestPermissions,
  };
}
