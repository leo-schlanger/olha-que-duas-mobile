import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { logger } from '../utils/logger';

const STORAGE_KEY = '@olhaqueduas:notification_prefs';
const SCHEDULED_NOTIFICATIONS_KEY = '@olhaqueduas:scheduled_notifications';

export type ReminderTime = 5 | 15 | 30 | 60;

export interface NotificationPreferences {
  enabled: boolean;
  reminderMinutes: ReminderTime;
  enabledShows: string[];
}

export interface ScheduledNotification {
  showName: string;
  dayOfWeek: number;
  time: string;
  notificationId: string;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: false,
  reminderMinutes: 15,
  enabledShows: [],
};

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class NotificationService {
  private preferences: NotificationPreferences = { ...DEFAULT_PREFERENCES };
  private scheduledNotifications: ScheduledNotification[] = [];
  private listeners: Set<(prefs: NotificationPreferences) => void> = new Set();
  private isInitialized = false;

  async initialize(): Promise<boolean> {
    try {
      await this.loadPreferences();
      await this.loadScheduledNotifications();
      this.isInitialized = true;
      return true;
    } catch (error) {
      logger.error('Error initializing notification service:', error);
      return false;
    }
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        logger.log('Notification permissions not granted');
        return false;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('program-reminders', {
          name: 'Lembretes de Programas',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#d6402e',
          sound: 'default',
        });
      }

      return true;
    } catch (error) {
      logger.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  async checkPermissions(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  private async loadPreferences(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.preferences = { ...DEFAULT_PREFERENCES, ...parsed };
      }
    } catch (error) {
      logger.error('Error loading notification preferences:', error);
    }
  }

  private async savePreferences(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.preferences));
      this.notifyListeners();
    } catch (error) {
      logger.error('Error saving notification preferences:', error);
    }
  }

  private async loadScheduledNotifications(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(SCHEDULED_NOTIFICATIONS_KEY);
      if (stored) {
        this.scheduledNotifications = JSON.parse(stored);
      }
    } catch (error) {
      logger.error('Error loading scheduled notifications:', error);
    }
  }

  private async saveScheduledNotifications(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        SCHEDULED_NOTIFICATIONS_KEY,
        JSON.stringify(this.scheduledNotifications)
      );
    } catch (error) {
      logger.error('Error saving scheduled notifications:', error);
    }
  }

  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return;
      }
    }
    this.preferences.enabled = enabled;
    await this.savePreferences();

    if (!enabled) {
      await this.cancelAllNotifications();
    }
  }

  async setReminderMinutes(minutes: ReminderTime): Promise<void> {
    this.preferences.reminderMinutes = minutes;
    await this.savePreferences();
    await this.rescheduleAllNotifications();
  }

  async toggleShowReminder(showName: string): Promise<boolean> {
    const index = this.preferences.enabledShows.indexOf(showName);
    if (index >= 0) {
      this.preferences.enabledShows.splice(index, 1);
      await this.cancelShowNotifications(showName);
    } else {
      if (!this.preferences.enabled) {
        const hasPermission = await this.requestPermissions();
        if (!hasPermission) {
          return false;
        }
        this.preferences.enabled = true;
      }
      this.preferences.enabledShows.push(showName);
    }
    await this.savePreferences();
    return this.preferences.enabledShows.includes(showName);
  }

  isShowEnabled(showName: string): boolean {
    return this.preferences.enabledShows.includes(showName);
  }

  async scheduleShowReminder(
    showName: string,
    dayOfWeek: number,
    time: string
  ): Promise<string | null> {
    if (!this.preferences.enabled) {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return null;
      }
      this.preferences.enabled = true;
      await this.savePreferences();
    }

    // Validate time format (HH:mm or HH:mm:ss)
    const timeParts = time.split(':');
    if (timeParts.length < 2) {
      logger.error('Invalid time format:', time);
      return null;
    }

    const [hours, minutes] = timeParts.map(Number);

    // Validate parsed values
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      logger.error('Invalid time values:', { hours, minutes, time });
      return null;
    }

    // Check if notification already exists for this show/day/time to prevent duplicates
    const existingNotification = this.scheduledNotifications.find(
      (n) => n.showName === showName && n.dayOfWeek === dayOfWeek && n.time === time
    );

    if (existingNotification) {
      logger.log(`Notification already exists for ${showName} on day ${dayOfWeek} at ${time}`);
      return existingNotification.notificationId;
    }
    const reminderMinutes = this.preferences.reminderMinutes;

    // Calculate reminder time
    let reminderHours = hours;
    let reminderMins = minutes - reminderMinutes;

    if (reminderMins < 0) {
      reminderMins += 60;
      reminderHours -= 1;
      if (reminderHours < 0) {
        reminderHours = 23;
      }
    }

    const trigger: Notifications.WeeklyTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: dayOfWeek === 0 ? 1 : dayOfWeek + 1, // expo-notifications uses 1-7 (Sunday=1)
      hour: reminderHours,
      minute: reminderMins,
    };

    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Olha que Duas',
          body: `${showName} comeca em ${reminderMinutes} minutos!`,
          sound: 'default',
          data: { showName, dayOfWeek, time },
        },
        trigger,
      });

      // Store scheduled notification
      this.scheduledNotifications.push({
        showName,
        dayOfWeek,
        time,
        notificationId,
      });
      await this.saveScheduledNotifications();

      // Add to enabled shows if not already
      if (!this.preferences.enabledShows.includes(showName)) {
        this.preferences.enabledShows.push(showName);
        await this.savePreferences();
      }

      logger.log(`Scheduled notification for ${showName} on day ${dayOfWeek} at ${time}`);
      return notificationId;
    } catch (error) {
      logger.error('Error scheduling notification:', error);
      return null;
    }
  }

  async cancelShowNotifications(showName: string): Promise<void> {
    const toCancel = this.scheduledNotifications.filter(
      (n) => n.showName === showName
    );

    for (const notification of toCancel) {
      try {
        await Notifications.cancelScheduledNotificationAsync(
          notification.notificationId
        );
      } catch (error) {
        logger.error('Error canceling notification:', error);
      }
    }

    this.scheduledNotifications = this.scheduledNotifications.filter(
      (n) => n.showName !== showName
    );
    await this.saveScheduledNotifications();
  }

  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      this.scheduledNotifications = [];
      await this.saveScheduledNotifications();
    } catch (error) {
      logger.error('Error canceling all notifications:', error);
    }
  }

  private async rescheduleAllNotifications(): Promise<void> {
    const currentScheduled = [...this.scheduledNotifications];
    await this.cancelAllNotifications();

    for (const notification of currentScheduled) {
      if (this.preferences.enabledShows.includes(notification.showName)) {
        await this.scheduleShowReminder(
          notification.showName,
          notification.dayOfWeek,
          notification.time
        );
      }
    }
  }

  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    return Notifications.getAllScheduledNotificationsAsync();
  }

  subscribe(listener: (prefs: NotificationPreferences) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const prefs = this.getPreferences();
    this.listeners.forEach((listener) => listener(prefs));
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

export const notificationService = new NotificationService();
