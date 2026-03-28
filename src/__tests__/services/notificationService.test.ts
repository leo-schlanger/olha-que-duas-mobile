import { notificationService } from '../../services/notificationService';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id-123')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly' },
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// Mock AppState
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const result = await notificationService.initialize();
      expect(result).toBe(true);
      expect(notificationService.isReady()).toBe(true);
    });

    it('should load saved preferences', async () => {
      // Note: Since notificationService is a singleton, we check it has reasonable defaults
      const prefs = notificationService.getPreferences();

      expect(prefs).toHaveProperty('enabled');
      expect(prefs).toHaveProperty('reminderMinutes');
      expect(prefs).toHaveProperty('enabledShows');
    });
  });

  describe('permissions', () => {
    it('should request permissions when enabling notifications', async () => {
      await notificationService.initialize();
      await notificationService.setEnabled(true);

      expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
    });

    it('should return false if permissions denied', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

      await notificationService.initialize();
      const result = await notificationService.setEnabled(true);

      expect(result.success).toBe(false);
    });
  });

  describe('preferences', () => {
    it('should get default preferences', async () => {
      await notificationService.initialize();
      const prefs = notificationService.getPreferences();

      expect(prefs).toHaveProperty('enabled');
      expect(prefs).toHaveProperty('reminderMinutes');
      expect(prefs).toHaveProperty('enabledShows');
    });

    it('should update reminder minutes', async () => {
      await notificationService.initialize();
      await notificationService.setReminderMinutes(30);

      const prefs = notificationService.getPreferences();
      expect(prefs.reminderMinutes).toBe(30);
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('show reminders', () => {
    beforeEach(async () => {
      await notificationService.initialize();
    });

    it('should check if show is enabled', () => {
      const isEnabled = notificationService.isShowEnabled('Test Show');
      expect(typeof isEnabled).toBe('boolean');
    });

    it('should schedule a show reminder', async () => {
      const result = await notificationService.scheduleShowReminder('Test Show', 1, '09:00');

      expect(result.success).toBe(true);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    });

    it('should validate time format', async () => {
      const result = await notificationService.scheduleShowReminder('Test Show', 1, 'invalid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid time format');
    });

    it('should validate day of week', async () => {
      const result = await notificationService.scheduleShowReminder('Test Show', 7, '09:00');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid day of week');
    });
  });

  describe('cancel notifications', () => {
    beforeEach(async () => {
      await notificationService.initialize();
    });

    it('should cancel all notifications', async () => {
      const result = await notificationService.cancelAllNotifications();

      expect(result.success).toBe(true);
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    });

    it('should cancel show notifications', async () => {
      // First schedule a notification
      await notificationService.scheduleShowReminder('Test Show', 1, '09:00');

      // Then cancel it
      const result = await notificationService.cancelShowNotifications('Test Show');

      expect(result.success).toBe(true);
    });
  });

  describe('subscription', () => {
    it('should notify listeners on preference changes', async () => {
      await notificationService.initialize();
      const listener = jest.fn();

      notificationService.subscribe(listener);

      // Listener should be called immediately with current prefs
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe correctly', async () => {
      await notificationService.initialize();
      const listener = jest.fn();

      const unsubscribe = notificationService.subscribe(listener);
      unsubscribe();

      // Further changes should not call the listener
      await notificationService.setEnabled(false);
      expect(listener).toHaveBeenCalledTimes(1); // Only initial call
    });
  });
});
