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
  scheduledAt: number; // timestamp for tracking
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
const _OPERATION_TIMEOUT = 10000; // 10 seconds - reserved for future use
const DEBOUNCE_DELAY = 300; // 300ms
const PORTUGAL_TIMEZONE = 'Europe/Lisbon';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: false,
  reminderMinutes: 15,
  enabledShows: [],
};

// ============================================================================
// TIMEZONE HELPERS
// ============================================================================

/**
 * Calcula o offset em minutos entre o timezone de Portugal e o timezone do dispositivo.
 * Positivo = dispositivo está à frente de Portugal
 * Negativo = dispositivo está atrás de Portugal
 */
function getTimezoneOffsetMinutes(): number {
  try {
    const now = new Date();

    // Obter hora atual em Portugal
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
    const portugalTotalMinutes = portugalHour * 60 + portugalMinute;

    // Obter hora atual no dispositivo (local)
    const localFormatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const localParts = localFormatter.formatToParts(now);
    const localHour = parseInt(localParts.find((p) => p.type === 'hour')?.value || '0', 10);
    const localMinute = parseInt(localParts.find((p) => p.type === 'minute')?.value || '0', 10);
    const localTotalMinutes = localHour * 60 + localMinute;

    // Calcular diferença
    let offset = localTotalMinutes - portugalTotalMinutes;

    // Ajustar para casos onde cruzamos a meia-noite
    // Se a diferença for maior que 12 horas, provavelmente cruzamos a meia-noite
    if (offset > 720) {
      offset -= 1440; // 24 horas em minutos
    } else if (offset < -720) {
      offset += 1440;
    }

    logger.log(
      `Timezone offset: ${offset} minutes (device is ${offset >= 0 ? 'ahead of' : 'behind'} Portugal)`
    );
    return offset;
  } catch (error) {
    logger.error('Error calculating timezone offset:', error);
    return 0; // Fallback: assume same timezone
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
  private operationLock = false;
  private operationQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private permissionCache: { granted: boolean; checkedAt: number } | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private lastKnownTimezoneOffset: number = 0;

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    try {
      await this.loadPreferences();
      await this.loadScheduledNotifications();
      await this.syncWithSystem();

      // Store initial timezone offset
      this.lastKnownTimezoneOffset = getTimezoneOffsetMinutes();

      // Setup periodic sync (every 5 minutes)
      this.startPeriodicSync();

      // Setup AppState listener to detect timezone changes
      this.setupAppStateListener();

      this.isInitialized = true;
      logger.log('NotificationService initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing notification service:', error);
      // Initialize with defaults on failure
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
    if (nextAppState === 'active') {
      // App came to foreground - check if timezone changed
      const currentOffset = getTimezoneOffsetMinutes();

      if (currentOffset !== this.lastKnownTimezoneOffset) {
        logger.log(`Timezone changed: ${this.lastKnownTimezoneOffset} → ${currentOffset} minutes`);
        this.lastKnownTimezoneOffset = currentOffset;

        // Reschedule all notifications with new timezone
        if (this.scheduledNotifications.length > 0) {
          logger.log('Rescheduling notifications due to timezone change...');
          await this.rescheduleAllNotifications();
        }
      }

      // Also sync with system
      await this.syncWithSystem();
    }
  };

  private startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    // Sync every 5 minutes
    this.syncInterval = setInterval(
      () => {
        this.syncWithSystem().catch((err) => {
          logger.error('Periodic sync failed:', err);
        });
      },
      5 * 60 * 1000
    );
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
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();
    this.listeners.clear();
    this.operationQueue = [];
  }

  // ==========================================================================
  // OPERATION QUEUE & LOCKING
  // ==========================================================================

  private async executeWithQueue<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.operationQueue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.operationQueue.length > 0) {
      const operation = this.operationQueue.shift();
      if (operation) {
        try {
          await operation();
        } catch (error) {
          logger.error('Queue operation failed:', error);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  private debounce(key: string, fn: () => void, delay: number = DEBOUNCE_DELAY): void {
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        fn();
      }, delay)
    );
  }

  isOperationPending(): boolean {
    return this.isProcessingQueue || this.operationQueue.length > 0;
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
    // Use cache if checked within last 30 seconds
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
          logger.log('Invalid preferences format, using defaults');
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
          // Filter out invalid entries
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

      // Find notifications that exist only locally (orphans in our state)
      const localOrphans = this.scheduledNotifications.filter(
        (n) => !systemIds.has(n.notificationId)
      );

      // Find notifications that exist only in system (orphans in system)
      const systemOrphans = systemNotifications.filter((n) => !localIds.has(n.identifier));

      // Cancel system orphans
      for (const orphan of systemOrphans) {
        try {
          await Notifications.cancelScheduledNotificationAsync(orphan.identifier);
          logger.log('Cancelled system orphan:', orphan.identifier);
        } catch (error) {
          logger.error('Error cancelling system orphan:', error);
        }
      }

      // Remove local orphans from state
      if (localOrphans.length > 0) {
        this.scheduledNotifications = this.scheduledNotifications.filter((n) =>
          systemIds.has(n.notificationId)
        );
        await this.saveScheduledNotifications();
        logger.log(`Removed ${localOrphans.length} local orphan(s)`);
      }

      // Sync enabledShows with actual scheduled notifications
      const scheduledShowNames = new Set(this.scheduledNotifications.map((n) => n.showName));
      const enabledShowsNeedUpdate = this.preferences.enabledShows.some(
        (show) => !scheduledShowNames.has(show)
      );

      if (enabledShowsNeedUpdate) {
        // Remove shows from enabledShows that have no scheduled notifications
        this.preferences.enabledShows = this.preferences.enabledShows.filter((show) =>
          scheduledShowNames.has(show)
        );
        await this.savePreferences();
        this.notifyListeners();
      }

      if (systemOrphans.length > 0 || localOrphans.length > 0 || enabledShowsNeedUpdate) {
        logger.log(
          `Sync complete: ${systemOrphans.length} system orphans, ${localOrphans.length} local orphans removed`
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
    return this.executeWithQueue(async () => {
      if (enabled) {
        const hasPermission = await this.requestPermissions();
        if (!hasPermission) {
          throw new Error('Permission not granted');
        }
      }

      this.preferences = { ...this.preferences, enabled };

      if (!(await this.savePreferences())) {
        throw new Error('Failed to save preferences');
      }

      if (!enabled) {
        await this.cancelAllNotificationsInternal();
      }

      this.notifyListeners();
    })
      .then(() => ({ success: true }))
      .catch((error) => ({ success: false, error: error.message }));
  }

  async setReminderMinutes(minutes: ReminderTime): Promise<OperationResult> {
    return this.executeWithQueue(async () => {
      const oldMinutes = this.preferences.reminderMinutes;
      this.preferences = { ...this.preferences, reminderMinutes: minutes };

      if (!(await this.savePreferences())) {
        // Rollback
        this.preferences = { ...this.preferences, reminderMinutes: oldMinutes };
        throw new Error('Failed to save preferences');
      }

      // Reschedule all notifications with new reminder time
      await this.rescheduleAllNotifications();
      this.notifyListeners();
    })
      .then(() => ({ success: true }))
      .catch((error) => ({ success: false, error: error.message }));
  }

  // ==========================================================================
  // SHOW REMINDER MANAGEMENT
  // ==========================================================================

  isShowEnabled(showName: string): boolean {
    return this.preferences.enabledShows.includes(showName);
  }

  async toggleShowReminder(showName: string): Promise<OperationResult<boolean>> {
    // Debounce rapid clicks
    return new Promise((resolve) => {
      this.debounce(`toggle-${showName}`, async () => {
        try {
          await this.executeWithQueue(async () => {
            const isEnabled = this.isShowEnabled(showName);

            if (isEnabled) {
              // Disable - cancel all notifications for this show
              await this.cancelShowNotificationsInternal(showName);
              this.preferences = {
                ...this.preferences,
                enabledShows: this.preferences.enabledShows.filter((s) => s !== showName),
              };
            } else {
              // Enable - will be scheduled when scheduleShowReminder is called
              if (!this.preferences.enabled) {
                const hasPermission = await this.requestPermissions();
                if (!hasPermission) {
                  throw new Error('Permission not granted');
                }
                this.preferences = { ...this.preferences, enabled: true };
              }
              this.preferences = {
                ...this.preferences,
                enabledShows: [...this.preferences.enabledShows, showName],
              };
            }

            if (!(await this.savePreferences())) {
              throw new Error('Failed to save preferences');
            }

            this.notifyListeners();
          });

          resolve({ success: true, data: this.isShowEnabled(showName) });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Operation failed';
          resolve({ success: false, error: message });
        }
      });
    });
  }

  async scheduleShowReminder(
    showName: string,
    dayOfWeek: number,
    time: string
  ): Promise<OperationResult<string>> {
    // Validate inputs
    if (!isValidDayOfWeek(dayOfWeek)) {
      return { success: false, error: 'Invalid day of week' };
    }
    if (!isValidTime(time)) {
      return { success: false, error: 'Invalid time format' };
    }

    return this.executeWithQueue(async () => {
      // Ensure permissions and enabled state
      if (!this.preferences.enabled) {
        const hasPermission = await this.requestPermissions();
        if (!hasPermission) {
          throw new Error('Permission not granted');
        }
        this.preferences = { ...this.preferences, enabled: true };
        await this.savePreferences();
      }

      // Normalize time to HH:mm
      const normalizedTime = time.slice(0, 5);

      // Check for existing notification
      const existing = this.scheduledNotifications.find(
        (n) => n.showName === showName && n.dayOfWeek === dayOfWeek && n.time === normalizedTime
      );

      if (existing) {
        // Verify it exists in system
        const systemNotifications = await Notifications.getAllScheduledNotificationsAsync();
        const existsInSystem = systemNotifications.some(
          (n) => n.identifier === existing.notificationId
        );

        if (existsInSystem) {
          return existing.notificationId;
        }
        // If not in system, remove from local state and reschedule
        this.scheduledNotifications = this.scheduledNotifications.filter(
          (n) => n.notificationId !== existing.notificationId
        );
      }

      // Calculate reminder time with timezone adjustment
      // Show times are in Portugal timezone, we need to convert to device local time
      const [hours, minutes] = normalizedTime.split(':').map(Number);
      const timezoneOffset = getTimezoneOffsetMinutes();

      // Convert Portugal show time to device local time, then subtract reminder
      // Total minutes from midnight in Portugal
      let totalMinutes = hours * 60 + minutes;
      // Add timezone offset (positive = device ahead of Portugal)
      totalMinutes += timezoneOffset;
      // Subtract reminder time
      totalMinutes -= this.preferences.reminderMinutes;

      // Handle day changes
      let reminderDayOfWeek = dayOfWeek;

      // If totalMinutes went negative (previous day)
      while (totalMinutes < 0) {
        totalMinutes += 1440; // Add 24 hours
        reminderDayOfWeek -= 1;
        if (reminderDayOfWeek < 0) {
          reminderDayOfWeek = 6; // Wrap to Saturday
        }
      }

      // If totalMinutes exceeded 24 hours (next day)
      while (totalMinutes >= 1440) {
        totalMinutes -= 1440; // Subtract 24 hours
        reminderDayOfWeek += 1;
        if (reminderDayOfWeek > 6) {
          reminderDayOfWeek = 0; // Wrap to Sunday
        }
      }

      const reminderHours = Math.floor(totalMinutes / 60);
      const reminderMins = totalMinutes % 60;

      // Create trigger (expo-notifications uses 1-7, Sunday=1)
      // JavaScript: 0=Sunday, 1=Monday, ..., 6=Saturday
      // expo-notifications: 1=Sunday, 2=Monday, ..., 7=Saturday
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

      // Schedule notification
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Olha que Duas',
          body: `${showName} começa em ${this.preferences.reminderMinutes} minutos!`,
          sound: 'default',
          data: { showName, dayOfWeek, time: normalizedTime },
        },
        trigger,
      });

      // Add to local state
      const notification: ScheduledNotification = {
        showName,
        dayOfWeek,
        time: normalizedTime,
        notificationId,
        scheduledAt: Date.now(),
      };

      this.scheduledNotifications = [...this.scheduledNotifications, notification];

      if (!(await this.saveScheduledNotifications())) {
        // Rollback - cancel the scheduled notification
        await Notifications.cancelScheduledNotificationAsync(notificationId);
        this.scheduledNotifications = this.scheduledNotifications.filter(
          (n) => n.notificationId !== notificationId
        );
        throw new Error('Failed to save notification');
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

      logger.log(`Scheduled notification for ${showName} on day ${dayOfWeek} at ${normalizedTime}`);
      return notificationId;
    })
      .then((data) => ({ success: true, data: data as string }))
      .catch((error) => ({ success: false, error: error.message }));
  }

  async scheduleAllTimesForShow(
    showName: string,
    dayOfWeek: number,
    times: string[]
  ): Promise<OperationResult<{ scheduled: number; failed: number }>> {
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

    // If all failed, rollback any that succeeded
    if (scheduled > 0 && failed === times.length) {
      await this.cancelShowNotificationsInternal(showName);
      return { success: false, error: 'Failed to schedule all notifications' };
    }

    return { success: true, data: { scheduled, failed } };
  }

  async cancelShowNotifications(showName: string): Promise<OperationResult> {
    return this.executeWithQueue(async () => {
      await this.cancelShowNotificationsInternal(showName);

      // Remove from enabledShows
      this.preferences = {
        ...this.preferences,
        enabledShows: this.preferences.enabledShows.filter((s) => s !== showName),
      };
      await this.savePreferences();
      this.notifyListeners();
    })
      .then(() => ({ success: true }))
      .catch((error) => ({ success: false, error: error.message }));
  }

  private async cancelShowNotificationsInternal(showName: string): Promise<void> {
    const toCancel = this.scheduledNotifications.filter((n) => n.showName === showName);
    const cancelledIds: string[] = [];

    for (const notification of toCancel) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notification.notificationId);
        cancelledIds.push(notification.notificationId);
      } catch (error) {
        logger.error('Error canceling notification:', error);
        // Still mark as cancelled - it might not exist in system
        cancelledIds.push(notification.notificationId);
      }
    }

    this.scheduledNotifications = this.scheduledNotifications.filter(
      (n) => !cancelledIds.includes(n.notificationId)
    );
    await this.saveScheduledNotifications();
  }

  async cancelAllNotifications(): Promise<OperationResult> {
    return this.executeWithQueue(async () => {
      await this.cancelAllNotificationsInternal();

      this.preferences = {
        ...this.preferences,
        enabledShows: [],
      };
      await this.savePreferences();
      this.notifyListeners();
    })
      .then(() => ({ success: true }))
      .catch((error) => ({ success: false, error: error.message }));
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
        } catch (_innerError) {
          // Ignore individual errors
        }
      }
    }
    this.scheduledNotifications = [];
    await this.saveScheduledNotifications();
  }

  private async rescheduleAllNotifications(): Promise<void> {
    const currentScheduled = [...this.scheduledNotifications];

    // Cancel all first
    await this.cancelAllNotificationsInternal();

    // Reschedule only for enabled shows
    const enabledSet = new Set(this.preferences.enabledShows);

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

  // ==========================================================================
  // LISTENERS
  // ==========================================================================

  subscribe(listener: PreferencesListener): () => void {
    this.listeners.add(listener);
    // Send current state immediately
    listener(this.getPreferences());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const prefs = this.getPreferences();
    this.listeners.forEach((listener) => {
      try {
        listener(prefs);
      } catch (error) {
        logger.error('Error in notification listener:', error);
      }
    });
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const notificationService = new NotificationService();
