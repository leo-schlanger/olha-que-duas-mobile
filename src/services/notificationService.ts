import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { logger } from '../utils/logger';
import { STORAGE_KEYS } from '../config/constants';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

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
  scheduledAt: number;
}

interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

type PreferencesListener = (_prefs: NotificationPreferences) => void;

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = STORAGE_KEYS.NOTIFICATION_PREFS;
const SCHEDULED_NOTIFICATIONS_KEY = STORAGE_KEYS.SCHEDULED_NOTIFICATIONS;
const NOTIFICATION_CHANNEL_ID = 'program-reminders';
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const PORTUGAL_TIMEZONE = 'Europe/Lisbon';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: false,
  reminderMinutes: 15,
  enabledShows: [],
};

// ============================================================================
// TIMEZONE HELPERS
// ============================================================================

function getTimezoneOffsetMinutes(): number {
  try {
    const now = new Date();

    const portugalFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: PORTUGAL_TIMEZONE,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const portugalParts = portugalFormatter.formatToParts(now);
    const portugalHour = parseInt(portugalParts.find((p) => p.type === 'hour')?.value || '0', 10);
    const portugalMinute = parseInt(
      portugalParts.find((p) => p.type === 'minute')?.value || '0',
      10
    );
    const portugalTotal = portugalHour * 60 + portugalMinute;

    const localFormatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const localParts = localFormatter.formatToParts(now);
    const localHour = parseInt(localParts.find((p) => p.type === 'hour')?.value || '0', 10);
    const localMinute = parseInt(localParts.find((p) => p.type === 'minute')?.value || '0', 10);
    const localTotal = localHour * 60 + localMinute;

    let offset = localTotal - portugalTotal;
    if (offset > 720) offset -= 1440;
    else if (offset < -720) offset += 1440;

    return offset;
  } catch (error) {
    logger.error('Error calculating timezone offset:', error);
    return 0;
  }
}

// ============================================================================
// NOTIFICATION HANDLER CONFIGURATION
// ============================================================================

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function isValidTime(time: string): boolean {
  const parts = time.split(':');
  if (parts.length < 2) return false;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  return (
    !isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
  );
}

function isValidDayOfWeek(day: number): boolean {
  return Number.isInteger(day) && day >= 0 && day <= 6;
}

function isValidPreferences(data: unknown): data is NotificationPreferences {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.enabled === 'boolean' &&
    [5, 15, 30, 60].includes(obj.reminderMinutes as number) &&
    Array.isArray(obj.enabledShows) &&
    obj.enabledShows.every((s: unknown) => typeof s === 'string')
  );
}

function isValidScheduledNotification(data: unknown): data is ScheduledNotification {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.showName === 'string' &&
    typeof obj.dayOfWeek === 'number' &&
    typeof obj.time === 'string' &&
    typeof obj.notificationId === 'string'
  );
}

// ============================================================================
// NOTIFICATION SERVICE CLASS
// ============================================================================

class NotificationService {
  private preferences: NotificationPreferences = { ...DEFAULT_PREFERENCES };
  private scheduledNotifications: ScheduledNotification[] = [];
  private listeners: Set<PreferencesListener> = new Set();
  private isInitialized = false;
  private isBusy = false;
  private permissionCache: { granted: boolean; checkedAt: number } | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private lastKnownTimezoneOffset: number = 0;

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      await this.loadPreferences();
      await this.loadScheduledNotifications();
      await this.syncWithSystem();
      this.lastKnownTimezoneOffset = getTimezoneOffsetMinutes();
      this.startPeriodicSync();
      this.setupAppStateListener();
      this.isInitialized = true;
      logger.log('NotificationService initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing notification service:', error);
      this.preferences = { ...DEFAULT_PREFERENCES };
      this.scheduledNotifications = [];
      this.isInitialized = true;
      return false;
    }
  }

  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus): Promise<void> => {
    if (nextAppState !== 'active') return;
    // Skip if another operation is in progress to avoid concurrent state mutation
    if (this.isBusy) return;

    try {
      const currentOffset = getTimezoneOffsetMinutes();
      if (currentOffset !== this.lastKnownTimezoneOffset) {
        logger.log(`Timezone changed: ${this.lastKnownTimezoneOffset} → ${currentOffset} minutes`);
        this.lastKnownTimezoneOffset = currentOffset;

        if (this.scheduledNotifications.length > 0) {
          this.isBusy = true;
          try {
            await this.rescheduleAllNotifications();
          } finally {
            this.isBusy = false;
          }
        }
      }

      if (!this.isBusy) {
        await this.syncWithSystem();
      }
    } catch (error) {
      logger.error('Error handling app state change for notifications:', error);
    }
  };

  private startPeriodicSync(): void {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      if (this.isBusy) return;
      this.syncWithSystem().catch((err) => logger.error('Periodic sync failed:', err));
    }, SYNC_INTERVAL_MS);
  }

  cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.listeners.clear();
  }

  // ==========================================================================
  // PERMISSIONS
  // ==========================================================================

  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      const granted = finalStatus === 'granted';
      this.permissionCache = { granted, checkedAt: Date.now() };

      if (granted && Platform.OS === 'android') {
        await this.setupAndroidChannel();
      }

      return granted;
    } catch (error) {
      logger.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  async checkPermissions(): Promise<boolean> {
    if (this.permissionCache && Date.now() - this.permissionCache.checkedAt < 30000) {
      return this.permissionCache.granted;
    }

    try {
      const { status } = await Notifications.getPermissionsAsync();
      const granted = status === 'granted';
      this.permissionCache = { granted, checkedAt: Date.now() };
      return granted;
    } catch {
      return false;
    }
  }

  private async setupAndroidChannel(): Promise<void> {
    try {
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
        name: 'Lembretes de Programas',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#d6402e',
        sound: 'default',
      });
    } catch (error) {
      logger.error('Error setting up Android channel:', error);
    }
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  private async loadPreferences(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isValidPreferences(parsed)) {
          this.preferences = parsed;
        } else {
          this.preferences = { ...DEFAULT_PREFERENCES };
        }
      }
    } catch (error) {
      logger.error('Error loading notification preferences:', error);
      this.preferences = { ...DEFAULT_PREFERENCES };
    }
  }

  private async savePreferences(): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.preferences));
      return true;
    } catch (error) {
      logger.error('Error saving notification preferences:', error);
      return false;
    }
  }

  private async loadScheduledNotifications(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(SCHEDULED_NOTIFICATIONS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.scheduledNotifications = parsed.filter(isValidScheduledNotification);
        }
      }
    } catch (error) {
      logger.error('Error loading scheduled notifications:', error);
      this.scheduledNotifications = [];
    }
  }

  private async saveScheduledNotifications(): Promise<boolean> {
    try {
      await AsyncStorage.setItem(
        SCHEDULED_NOTIFICATIONS_KEY,
        JSON.stringify(this.scheduledNotifications)
      );
      return true;
    } catch (error) {
      logger.error('Error saving scheduled notifications:', error);
      return false;
    }
  }

  // ==========================================================================
  // SYNCHRONIZATION
  // ==========================================================================

  async syncWithSystem(): Promise<void> {
    try {
      const systemNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const systemIds = new Set(systemNotifications.map((n) => n.identifier));
      const localIds = new Set(this.scheduledNotifications.map((n) => n.notificationId));

      // Cancel system orphans (exist in system but not in local state)
      const systemOrphans = systemNotifications.filter((n) => !localIds.has(n.identifier));
      for (const orphan of systemOrphans) {
        try {
          await Notifications.cancelScheduledNotificationAsync(orphan.identifier);
        } catch (error) {
          logger.error('Error cancelling system orphan:', error);
        }
      }

      // Remove local orphans (exist locally but not in system)
      const localOrphans = this.scheduledNotifications.filter(
        (n) => !systemIds.has(n.notificationId)
      );
      if (localOrphans.length > 0) {
        this.scheduledNotifications = this.scheduledNotifications.filter((n) =>
          systemIds.has(n.notificationId)
        );
        await this.saveScheduledNotifications();
      }

      // Sync enabledShows with actual scheduled notifications
      const scheduledShowNames = new Set(this.scheduledNotifications.map((n) => n.showName));
      const staleShows = this.preferences.enabledShows.filter(
        (show) => !scheduledShowNames.has(show)
      );
      if (staleShows.length > 0) {
        this.preferences = {
          ...this.preferences,
          enabledShows: this.preferences.enabledShows.filter((show) =>
            scheduledShowNames.has(show)
          ),
        };
        await this.savePreferences();
        this.notifyListeners();
      }

      if (systemOrphans.length > 0 || localOrphans.length > 0 || staleShows.length > 0) {
        logger.log(
          `Sync: removed ${systemOrphans.length} system orphans, ${localOrphans.length} local orphans, ${staleShows.length} stale shows`
        );
      }
    } catch (error) {
      logger.error('Error syncing with system:', error);
    }
  }

  async forceSync(): Promise<void> {
    await this.syncWithSystem();
  }

  // ==========================================================================
  // PREFERENCES MANAGEMENT
  // ==========================================================================

  getPreferences(): NotificationPreferences {
    return {
      ...this.preferences,
      enabledShows: [...this.preferences.enabledShows],
    };
  }

  async setEnabled(enabled: boolean): Promise<OperationResult> {
    if (this.isBusy) return { success: false, error: 'Operation in progress' };
    this.isBusy = true;

    try {
      if (enabled) {
        const hasPermission = await this.requestPermissions();
        if (!hasPermission) {
          return { success: false, error: 'Permission not granted' };
        }
      }

      this.preferences = { ...this.preferences, enabled };

      if (!(await this.savePreferences())) {
        return { success: false, error: 'Failed to save preferences' };
      }

      if (!enabled) {
        await this.cancelAllNotificationsInternal();
      }

      this.notifyListeners();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error setting enabled:', error);
      return { success: false, error: message };
    } finally {
      this.isBusy = false;
    }
  }

  async setReminderMinutes(minutes: ReminderTime): Promise<OperationResult> {
    if (this.isBusy) return { success: false, error: 'Operation in progress' };
    this.isBusy = true;

    try {
      const oldMinutes = this.preferences.reminderMinutes;
      this.preferences = { ...this.preferences, reminderMinutes: minutes };

      if (!(await this.savePreferences())) {
        this.preferences = { ...this.preferences, reminderMinutes: oldMinutes };
        return { success: false, error: 'Failed to save preferences' };
      }

      // Reschedule all notifications with new reminder time
      // This is called directly (not through the queue) to avoid deadlock
      await this.rescheduleAllNotifications();
      this.notifyListeners();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error setting reminder minutes:', error);
      return { success: false, error: message };
    } finally {
      this.isBusy = false;
    }
  }

  // ==========================================================================
  // SHOW REMINDER MANAGEMENT
  // ==========================================================================

  isShowEnabled(showName: string): boolean {
    return this.preferences.enabledShows.includes(showName);
  }

  async toggleShowReminder(showName: string): Promise<OperationResult<boolean>> {
    if (this.isBusy) return { success: false, error: 'Operation in progress' };
    this.isBusy = true;

    try {
      const isEnabled = this.isShowEnabled(showName);

      if (isEnabled) {
        await this.cancelShowNotificationsInternal(showName);
        this.preferences = {
          ...this.preferences,
          enabledShows: this.preferences.enabledShows.filter((s) => s !== showName),
        };
      } else {
        if (!this.preferences.enabled) {
          const hasPermission = await this.requestPermissions();
          if (!hasPermission) {
            return { success: false, error: 'Permission not granted' };
          }
          this.preferences = { ...this.preferences, enabled: true };
        }
        this.preferences = {
          ...this.preferences,
          enabledShows: [...this.preferences.enabledShows, showName],
        };
      }

      if (!(await this.savePreferences())) {
        return { success: false, error: 'Failed to save preferences' };
      }

      this.notifyListeners();
      return { success: true, data: !isEnabled };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error toggling show reminder:', error);
      return { success: false, error: message };
    } finally {
      this.isBusy = false;
    }
  }

  async scheduleShowReminder(
    showName: string,
    dayOfWeek: number,
    time: string
  ): Promise<OperationResult<string>> {
    if (!isValidDayOfWeek(dayOfWeek)) {
      return { success: false, error: 'Invalid day of week' };
    }
    if (!isValidTime(time)) {
      return { success: false, error: 'Invalid time format' };
    }

    try {
      // Ensure permissions and enabled state
      if (!this.preferences.enabled) {
        const hasPermission = await this.requestPermissions();
        if (!hasPermission) {
          return { success: false, error: 'Permission not granted' };
        }
        this.preferences = { ...this.preferences, enabled: true };
        await this.savePreferences();
      }

      const normalizedTime = time.slice(0, 5);

      // Check for existing notification
      const existing = this.scheduledNotifications.find(
        (n) => n.showName === showName && n.dayOfWeek === dayOfWeek && n.time === normalizedTime
      );

      if (existing) {
        const systemNotifications = await Notifications.getAllScheduledNotificationsAsync();
        const existsInSystem = systemNotifications.some(
          (n) => n.identifier === existing.notificationId
        );

        if (existsInSystem) {
          return { success: true, data: existing.notificationId };
        }
        // Remove stale local entry
        this.scheduledNotifications = this.scheduledNotifications.filter(
          (n) => n.notificationId !== existing.notificationId
        );
      }

      // Calculate reminder time with timezone adjustment
      const [hours, minutes] = normalizedTime.split(':').map(Number);
      const timezoneOffset = getTimezoneOffsetMinutes();

      let totalMinutes = hours * 60 + minutes;
      totalMinutes += timezoneOffset;
      totalMinutes -= this.preferences.reminderMinutes;

      let reminderDayOfWeek = dayOfWeek;

      while (totalMinutes < 0) {
        totalMinutes += 1440;
        reminderDayOfWeek = reminderDayOfWeek === 0 ? 6 : reminderDayOfWeek - 1;
      }
      while (totalMinutes >= 1440) {
        totalMinutes -= 1440;
        reminderDayOfWeek = reminderDayOfWeek === 6 ? 0 : reminderDayOfWeek + 1;
      }

      const reminderHours = Math.floor(totalMinutes / 60);
      const reminderMins = totalMinutes % 60;

      // JS weekday (0=Sunday) to expo weekday (1=Sunday)
      const expoWeekday = reminderDayOfWeek === 0 ? 1 : reminderDayOfWeek + 1;

      logger.log(
        `Scheduling: ${showName} at ${normalizedTime} PT → ${String(reminderHours).padStart(2, '0')}:${String(reminderMins).padStart(2, '0')} local (day ${reminderDayOfWeek})`
      );

      const trigger: Notifications.WeeklyTriggerInput = {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: expoWeekday,
        hour: reminderHours,
        minute: reminderMins,
      };

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Olha que Duas',
          body: `${showName} começa em ${this.preferences.reminderMinutes} minutos!`,
          sound: 'default',
          data: { showName, dayOfWeek, time: normalizedTime },
        },
        trigger,
      });

      const notification: ScheduledNotification = {
        showName,
        dayOfWeek,
        time: normalizedTime,
        notificationId,
        scheduledAt: Date.now(),
      };

      this.scheduledNotifications = [...this.scheduledNotifications, notification];

      if (!(await this.saveScheduledNotifications())) {
        // Rollback
        await Notifications.cancelScheduledNotificationAsync(notificationId);
        this.scheduledNotifications = this.scheduledNotifications.filter(
          (n) => n.notificationId !== notificationId
        );
        return { success: false, error: 'Failed to save notification' };
      }

      // Ensure show is in enabledShows
      if (!this.preferences.enabledShows.includes(showName)) {
        this.preferences = {
          ...this.preferences,
          enabledShows: [...this.preferences.enabledShows, showName],
        };
        await this.savePreferences();
        this.notifyListeners();
      }

      return { success: true, data: notificationId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error scheduling reminder for ${showName}:`, error);
      return { success: false, error: message };
    }
  }

  async scheduleAllTimesForShow(
    showName: string,
    dayOfWeek: number,
    times: string[]
  ): Promise<OperationResult<{ scheduled: number; failed: number }>> {
    if (this.isBusy) return { success: false, error: 'Operation in progress' };
    this.isBusy = true;

    try {
      let scheduled = 0;
      let failed = 0;

      for (const time of times) {
        const result = await this.scheduleShowReminder(showName, dayOfWeek, time);
        if (result.success) {
          scheduled++;
        } else {
          failed++;
        }
      }

      if (scheduled === 0) {
        return { success: false, error: 'Failed to schedule any notifications' };
      }

      return { success: true, data: { scheduled, failed } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error scheduling all times for show:', error);
      return { success: false, error: message };
    } finally {
      this.isBusy = false;
    }
  }

  async cancelShowNotifications(showName: string): Promise<OperationResult> {
    if (this.isBusy) return { success: false, error: 'Operation in progress' };
    this.isBusy = true;

    try {
      await this.cancelShowNotificationsInternal(showName);

      this.preferences = {
        ...this.preferences,
        enabledShows: this.preferences.enabledShows.filter((s) => s !== showName),
      };
      await this.savePreferences();
      this.notifyListeners();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error cancelling show notifications:', error);
      return { success: false, error: message };
    } finally {
      this.isBusy = false;
    }
  }

  private async cancelShowNotificationsInternal(showName: string): Promise<void> {
    const toCancel = this.scheduledNotifications.filter((n) => n.showName === showName);

    for (const notification of toCancel) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notification.notificationId);
      } catch (error) {
        logger.error('Error canceling notification:', error);
      }
    }

    this.scheduledNotifications = this.scheduledNotifications.filter(
      (n) => n.showName !== showName
    );
    await this.saveScheduledNotifications();
  }

  async cancelAllNotifications(): Promise<OperationResult> {
    if (this.isBusy) return { success: false, error: 'Operation in progress' };
    this.isBusy = true;

    try {
      await this.cancelAllNotificationsInternal();

      this.preferences = {
        ...this.preferences,
        enabledShows: [],
      };
      await this.savePreferences();
      this.notifyListeners();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error cancelling all notifications:', error);
      return { success: false, error: message };
    } finally {
      this.isBusy = false;
    }
  }

  private async cancelAllNotificationsInternal(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      logger.error('Error canceling all notifications:', error);
      // Fallback: cancel one by one
      for (const notification of this.scheduledNotifications) {
        try {
          await Notifications.cancelScheduledNotificationAsync(notification.notificationId);
        } catch {
          // Ignore individual errors
        }
      }
    }
    this.scheduledNotifications = [];
    await this.saveScheduledNotifications();
  }

  private async rescheduleAllNotifications(): Promise<void> {
    const currentScheduled = [...this.scheduledNotifications];
    const enabledSet = new Set(this.preferences.enabledShows);

    // Cancel all first
    await this.cancelAllNotificationsInternal();

    // Reschedule only for enabled shows (calls scheduleShowReminder directly, no lock)
    for (const notification of currentScheduled) {
      if (enabledSet.has(notification.showName)) {
        await this.scheduleShowReminder(
          notification.showName,
          notification.dayOfWeek,
          notification.time
        );
      }
    }
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    return Notifications.getAllScheduledNotificationsAsync();
  }

  getLocalScheduledNotifications(): ScheduledNotification[] {
    return [...this.scheduledNotifications];
  }

  getScheduledNotificationsForShow(showName: string): ScheduledNotification[] {
    return this.scheduledNotifications.filter((n) => n.showName === showName);
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  isOperationPending(): boolean {
    return this.isBusy;
  }

  // ==========================================================================
  // LISTENERS
  // ==========================================================================

  subscribe(listener: PreferencesListener): () => void {
    this.listeners.add(listener);
    listener(this.getPreferences());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const prefs = this.getPreferences();
    const deadListeners: PreferencesListener[] = [];

    this.listeners.forEach((listener) => {
      try {
        listener(prefs);
      } catch (error) {
        logger.error('Error in notification listener:', error);
        deadListeners.push(listener);
      }
    });

    // Remove listeners that threw errors
    for (const dead of deadListeners) {
      this.listeners.delete(dead);
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const notificationService = new NotificationService();
