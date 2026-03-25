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
  private isOperationInProgress = false; // Previne race conditions

  async initialize(): Promise<boolean> {
    try {
      await this.loadPreferences();
      await this.loadScheduledNotifications();

      // Sincronizar com notificações do sistema para limpar órfãs
      await this.syncWithSystemNotifications();

      this.isInitialized = true;
      return true;
    } catch (error) {
      logger.error('Error initializing notification service:', error);
      return false;
    }
  }

  /**
   * Sincroniza o estado local com as notificações realmente agendadas no sistema.
   * Remove notificações órfãs (que existem no sistema mas não no estado local)
   * e limpa referências locais de notificações que não existem mais no sistema.
   */
  private async syncWithSystemNotifications(): Promise<void> {
    try {
      const systemNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const systemIds = new Set(systemNotifications.map(n => n.identifier));

      // Remover do estado local notificações que não existem mais no sistema
      const validLocalNotifications = this.scheduledNotifications.filter(
        n => systemIds.has(n.notificationId)
      );

      // Cancelar notificações órfãs do sistema (que não estão no nosso estado)
      const localIds = new Set(this.scheduledNotifications.map(n => n.notificationId));
      const orphanNotifications = systemNotifications.filter(
        n => !localIds.has(n.identifier)
      );

      for (const orphan of orphanNotifications) {
        try {
          await Notifications.cancelScheduledNotificationAsync(orphan.identifier);
          logger.log('Cancelled orphan notification:', orphan.identifier);
        } catch (error) {
          logger.error('Error cancelling orphan notification:', error);
        }
      }

      // Atualizar estado local se houve mudanças
      if (validLocalNotifications.length !== this.scheduledNotifications.length || orphanNotifications.length > 0) {
        this.scheduledNotifications = validLocalNotifications;
        await this.saveScheduledNotifications();
        logger.log(`Synced notifications: ${validLocalNotifications.length} valid, ${orphanNotifications.length} orphans removed`);
      }
    } catch (error) {
      logger.error('Error syncing with system notifications:', error);
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
    // Prevenir race conditions de múltiplos cliques
    if (this.isOperationInProgress) {
      logger.log('Operation already in progress, ignoring toggle request');
      return this.preferences.enabledShows.includes(showName);
    }

    this.isOperationInProgress = true;
    try {
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
    } finally {
      this.isOperationInProgress = false;
    }
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

    const cancelledIds: string[] = [];
    const failedIds: string[] = [];

    for (const notification of toCancel) {
      try {
        await Notifications.cancelScheduledNotificationAsync(
          notification.notificationId
        );
        cancelledIds.push(notification.notificationId);
      } catch (error) {
        logger.error('Error canceling notification:', error);
        failedIds.push(notification.notificationId);
      }
    }

    // Remover apenas as notificações que foram canceladas com sucesso
    // Mantém as que falharam para tentar novamente depois
    this.scheduledNotifications = this.scheduledNotifications.filter(
      (n) => n.showName !== showName || failedIds.includes(n.notificationId)
    );
    await this.saveScheduledNotifications();

    if (failedIds.length > 0) {
      logger.log(`${cancelledIds.length} notifications cancelled, ${failedIds.length} failed`);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      this.scheduledNotifications = [];
      await this.saveScheduledNotifications();
    } catch (error) {
      logger.error('Error canceling all notifications:', error);
      // Fallback: tentar cancelar uma por uma
      for (const notification of this.scheduledNotifications) {
        try {
          await Notifications.cancelScheduledNotificationAsync(notification.notificationId);
        } catch (innerError) {
          logger.error('Fallback cancel error:', innerError);
        }
      }
      this.scheduledNotifications = [];
      await this.saveScheduledNotifications();
    }
  }

  private async rescheduleAllNotifications(): Promise<void> {
    // Prevenir race conditions
    if (this.isOperationInProgress) {
      logger.log('Operation already in progress, skipping reschedule');
      return;
    }

    this.isOperationInProgress = true;
    try {
      const currentScheduled = [...this.scheduledNotifications];

      // Primeiro, cancelar todas
      await this.cancelAllNotifications();

      // Reagendar apenas os programas habilitados
      const failedNotifications: ScheduledNotification[] = [];

      for (const notification of currentScheduled) {
        if (this.preferences.enabledShows.includes(notification.showName)) {
          const result = await this.scheduleShowReminder(
            notification.showName,
            notification.dayOfWeek,
            notification.time
          );
          if (!result) {
            failedNotifications.push(notification);
          }
        }
      }

      if (failedNotifications.length > 0) {
        logger.log(`${failedNotifications.length} notifications failed to reschedule`);
      }
    } finally {
      this.isOperationInProgress = false;
    }
  }

  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    return Notifications.getAllScheduledNotificationsAsync();
  }

  /**
   * Retorna as notificações agendadas localmente (nosso estado)
   */
  getLocalScheduledNotifications(): ScheduledNotification[] {
    return [...this.scheduledNotifications];
  }

  /**
   * Força sincronização com o sistema de notificações
   */
  async forceSync(): Promise<void> {
    await this.syncWithSystemNotifications();
  }

  /**
   * Verifica se há uma operação em andamento
   */
  isOperationPending(): boolean {
    return this.isOperationInProgress;
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
