/**
 * Main RadioPlayer component - orchestrates all radio sub-components
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  Platform,
  BackHandler,
  AppState,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useRadio } from '../hooks/useRadio';
import { radioService } from '../services/radioService';
import { useNowPlaying } from '../hooks/useNowPlaying';
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { useSchedule, GroupedSchedule } from '../hooks/useSchedule';
import { useDailySchedule, getCurrentPeriod } from '../hooks/useDailySchedule';
import { useNotifications } from '../hooks/useNotifications';
import { useToast } from '../context/ToastContext';
import { ReminderTime, notificationService } from '../services/notificationService';
import { logger } from '../utils/logger';
import { environment } from '../config/environment';
import { AboutBottomSheet } from './AboutBottomSheet';
import { RemindersBottomSheet } from './RemindersBottomSheet';

// Tag used with expo-keep-awake. A unique tag means we can activate/deactivate
// idempotently without colliding with other parts of the app (other screens
// or libs) that might use the default tag.
const KEEP_AWAKE_TAG = 'olhaqueduas-radio';

// Import radio sub-components
import {
  RadioControls,
  NowPlaying,
  RadioVisualizer,
  ScheduleSection,
  DailyScheduleSection,
  SocialLinks,
  RadioInfoCards,
} from './radio';

export function RadioPlayer() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const {
    isPlaying,
    isLoading,
    isReconnecting,
    reconnectAttempt,
    volume,
    radioName,
    radioTagline,
    togglePlayPause,
    setVolume,
    forceReconnect,
  } = useRadio();

  const { scheduleByDay, loading: scheduleLoading, error: scheduleError } = useSchedule();
  const { schedule: dailySchedule, loading: dailyLoading, error: dailyError } = useDailySchedule();
  const [currentPeriod, setCurrentPeriod] = useState(() => getCurrentPeriod());

  // Track when the app last went to background so we know whether to force a
  // notification sync on resume. Sync after 30+ min protects against drift
  // when the OS or user cleared notifications externally.
  const lastBackgroundedAtRef = useRef<number | null>(null);
  const SYNC_THRESHOLD_MS = 30 * 60 * 1000;

  // Update currentPeriod when app returns to foreground, and force a notif
  // sync if we were backgrounded for a while.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setCurrentPeriod(getCurrentPeriod());

        const lastBg = lastBackgroundedAtRef.current;
        if (lastBg !== null && Date.now() - lastBg >= SYNC_THRESHOLD_MS) {
          notificationService
            .forceSync()
            .catch((err) => logger.error('Background sync failed', err));
        }
        lastBackgroundedAtRef.current = null;
      } else if (state === 'background' || state === 'inactive') {
        if (lastBackgroundedAtRef.current === null) {
          lastBackgroundedAtRef.current = Date.now();
        }
      }
    });
    return () => sub.remove();
  }, [SYNC_THRESHOLD_MS]);
  const nowPlaying = useNowPlaying(isPlaying);
  const {
    preferences: notificationPrefs,
    isLoading: notificationLoading,
    hasPermission,
    scheduleAllTimesForShow,
    cancelShowReminders,
    cancelAllReminders,
    setReminderMinutes,
    requestPermissions,
  } = useNotifications();
  const toast = useToast();

  const [showAboutSheet, setShowAboutSheet] = useState(false);
  const [showRemindersSheet, setShowRemindersSheet] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const showExpoGoWarning = environment.isExpoGo;

  // Toggle the OS-level "keep screen on" mode. expo-keep-awake uses
  // android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON / iOS
  // UIApplication.shared.isIdleTimerDisabled under the hood, so it costs
  // nothing while inactive and only prevents the screen from sleeping
  // while activated. We always deactivate on unmount so leaving the radio
  // screen never leaves the device awake forever.
  const handleToggleKeepAwake = useCallback(() => {
    setKeepAwake((current) => {
      const next = !current;
      if (next) {
        activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch((err) =>
          logger.error('activateKeepAwake failed', err)
        );
      } else {
        try {
          deactivateKeepAwake(KEEP_AWAKE_TAG);
        } catch (err) {
          logger.error('deactivateKeepAwake failed', err);
        }
      }
      return next;
    });
  }, []);

  // Make sure we never leak the wake lock if the component unmounts while
  // keep-awake is on (e.g. user navigates away with the toggle active).
  useEffect(() => {
    return () => {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // ignore — best effort
      }
    };
  }, []);

  // Optimistic mirror of notificationPrefs.enabledShows. The bell icon on each
  // schedule row is rendered from THIS so taps feel instant. The async
  // operation runs in the background; on failure we sync back to the real
  // preferences (rollback) and toast the user.
  const [optimisticEnabledShows, setOptimisticEnabledShows] = useState<Set<string>>(
    () => new Set(notificationPrefs.enabledShows)
  );

  // Whenever the real preferences change (success path or external sync),
  // re-sync the optimistic mirror so they don't diverge.
  useEffect(() => {
    setOptimisticEnabledShows(new Set(notificationPrefs.enabledShows));
  }, [notificationPrefs.enabledShows]);

  // Per-show "intent queue". Tracks the latest desired state per show so the
  // user can tap the bell rapidly and only the final intent is honored.
  // Value: { latest: true means "want enabled", running indicates a worker
  // is already processing this show. }
  const pendingOpsRef = useRef<
    Map<string, { latest: boolean; itemRef: GroupedSchedule; running: boolean }>
  >(new Map());

  const statusInfo = useMemo(() => {
    if (isReconnecting) {
      return {
        text: t('radio.status.reconnecting', { attempt: reconnectAttempt }),
        color: colors.secondary,
        dotColor: colors.secondary,
      };
    }
    if (isLoading) {
      return {
        text: t('radio.status.loading'),
        color: colors.textSecondary,
        dotColor: colors.secondary,
      };
    }
    if (isPlaying) {
      return {
        text: t('radio.status.onAir'),
        color: colors.success,
        dotColor: colors.success,
      };
    }
    return {
      text: t('radio.status.offline'),
      color: colors.textSecondary,
      dotColor: colors.textSecondary,
    };
  }, [isReconnecting, isLoading, isPlaying, reconnectAttempt, colors, t]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Worker that processes the latest intent for a single show. Loops until
  // the in-memory intent matches the executed result, so rapid taps collapse
  // to one final operation. Rollback uses the live notificationPrefs ref.
  const processShowQueue = useCallback(
    async (showName: string) => {
      const queue = pendingOpsRef.current;
      const entry = queue.get(showName);
      if (!entry || entry.running) return;
      entry.running = true;

      try {
        for (;;) {
          const target = entry.latest;
          const item = entry.itemRef;
          let success = false;

          try {
            if (target) {
              success = await scheduleAllTimesForShow(item.show, item.dayNumber, item.times);
            } else {
              success = await cancelShowReminders(item.show);
            }
          } catch (err) {
            logger.error('processShowQueue: operation threw', err);
            success = false;
          }

          // If the user tapped again while we were running, the intent
          // changed under us — loop again and apply the latest target.
          if (entry.latest !== target) {
            continue;
          }

          if (success) {
            // The hook subscriber will sync notificationPrefs in a moment;
            // the optimistic mirror is already correct. Show a small toast.
            toast.show(
              target
                ? t('notifications.activatedToast')
                : t('notifications.removedToast', { count: 1 }),
              { variant: target ? 'success' : 'info' }
            );
          } else {
            // Rollback the optimistic mirror to whatever the real prefs say
            // right now (read live from the service to avoid stale closures).
            const livePrefs = notificationService.getPreferences();
            setOptimisticEnabledShows(new Set(livePrefs.enabledShows));
            toast.show(t('notifications.toggleError'), { variant: 'error' });
          }

          queue.delete(showName);
          return;
        }
      } finally {
        entry.running = false;
      }
    },
    [scheduleAllTimesForShow, cancelShowReminders, toast, t]
  );

  const handleToggleReminder = useCallback(
    (item: GroupedSchedule) => {
      // Permission check up-front for the *enable* path. If denied, we tell
      // the user via toast and don't optimistically flip anything.
      const willEnable = !optimisticEnabledShows.has(item.show);

      if (willEnable && hasPermission === false) {
        // Try to request; if still denied, surface via toast (no optimistic flip)
        requestPermissions().then((granted) => {
          if (!granted) {
            toast.show(t('notifications.permissionDeniedToast'), {
              variant: 'error',
              actionLabel: t('common.openSettings'),
              onAction: () => Linking.openSettings(),
            });
          } else {
            // Now retry the toggle with permission granted
            handleToggleReminder(item);
          }
        });
        return;
      }

      // 1) Optimistic update — bell flips immediately
      setOptimisticEnabledShows((prev) => {
        const next = new Set(prev);
        if (willEnable) next.add(item.show);
        else next.delete(item.show);
        return next;
      });

      // 2) Update / create the intent queue entry for this show
      const queue = pendingOpsRef.current;
      const existing = queue.get(item.show);
      if (existing) {
        existing.latest = willEnable;
        existing.itemRef = item;
      } else {
        queue.set(item.show, { latest: willEnable, itemRef: item, running: false });
      }

      // 3) Kick off the worker (no-op if already running for this show)
      processShowQueue(item.show);
    },
    [optimisticEnabledShows, hasPermission, requestPermissions, processShowQueue, toast, t]
  );

  // The bell next to the play button now opens the management sheet.
  const handleOpenNotificationSettings = useCallback(async () => {
    // If permission is unknown or denied AND there are no active reminders,
    // request permission first so the empty-state CTA actually works.
    if (notificationPrefs.enabledShows.length === 0 && hasPermission === false) {
      const granted = await requestPermissions();
      if (!granted) {
        toast.show(t('notifications.permissionDeniedToast'), {
          variant: 'error',
          actionLabel: t('common.openSettings'),
          onAction: () => Linking.openSettings(),
        });
        return;
      }
    }
    setShowRemindersSheet(true);
  }, [notificationPrefs.enabledShows.length, hasPermission, requestPermissions, toast, t]);

  // Handler used by the bottom sheet to remove a single reminder. Returns
  // boolean for the sheet's UI feedback (toast handled inside the sheet).
  const handleSheetRemoveShow = useCallback(
    async (show: string): Promise<boolean> => {
      // Optimistic update too — sheet removes the row immediately
      setOptimisticEnabledShows((prev) => {
        const next = new Set(prev);
        next.delete(show);
        return next;
      });
      try {
        const ok = await cancelShowReminders(show);
        if (!ok) {
          // Rollback
          const live = notificationService.getPreferences();
          setOptimisticEnabledShows(new Set(live.enabledShows));
        }
        return ok;
      } catch (err) {
        logger.error('handleSheetRemoveShow failed', err);
        const live = notificationService.getPreferences();
        setOptimisticEnabledShows(new Set(live.enabledShows));
        return false;
      }
    },
    [cancelShowReminders]
  );

  const handleSheetChangeMinutes = useCallback(
    async (minutes: ReminderTime): Promise<boolean> => {
      const ok = await setReminderMinutes(minutes);
      return ok;
    },
    [setReminderMinutes]
  );

  const handleSheetDisableAll = useCallback(async (): Promise<boolean> => {
    setOptimisticEnabledShows(new Set());
    try {
      const ok = await cancelAllReminders();
      if (ok) {
        toast.show(
          t('notifications.removedToast', { count: notificationPrefs.enabledShows.length }),
          { variant: 'info' }
        );
      } else {
        const live = notificationService.getPreferences();
        setOptimisticEnabledShows(new Set(live.enabledShows));
      }
      return ok;
    } catch (err) {
      logger.error('handleSheetDisableAll failed', err);
      const live = notificationService.getPreferences();
      setOptimisticEnabledShows(new Set(live.enabledShows));
      return false;
    }
  }, [cancelAllReminders, toast, t, notificationPrefs.enabledShows.length]);

  // Map of show name → times array, computed from the weekly schedule, so the
  // RemindersBottomSheet can show "Companheiros · 11:00, 19:00" rows.
  const showTimesByName = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const day of scheduleByDay) {
      for (const show of day.shows) {
        if (!map.has(show.show)) {
          map.set(show.show, show.times);
        }
      }
    }
    return map;
  }, [scheduleByDay]);

  // Optimistic isShowEnabled used by the ScheduleSection bell rendering.
  const isOptimisticallyEnabled = useCallback(
    (show: string) => optimisticEnabledShows.has(show),
    [optimisticEnabledShows]
  );

  // The schedule item bell uses isOperationPending only to disable the button;
  // since we now optimistically flip immediately, the user shouldn't be blocked.
  // Return a constant `false` so the bell never goes into a "stuck pending" state.
  const noOpIsOperationPending = useCallback(() => false, []);

  const handleExitApp = useCallback(() => {
    if (Platform.OS === 'android') {
      Alert.alert(t('radio.exitAppConfirm.title'), t('radio.exitAppConfirm.message'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('radio.exitAppConfirm.button'),
          style: 'destructive',
          onPress: async () => {
            await radioService.stop();
            BackHandler.exitApp();
          },
        },
      ]);
    }
  }, [t]);

  const handleRefresh = useCallback(() => {
    forceReconnect();
  }, [forceReconnect]);

  const openLink = useCallback((url: string) => {
    Linking.openURL(url);
  }, []);

  // Schedule section's bell button shows the badge with this count.
  const optimisticEnabledCount = optimisticEnabledShows.size;

  // The hook already returns a stable, classified NowPlayingData — pass it
  // straight through to NowPlaying without remapping (the service guarantees
  // referential stability when nothing changed via its dataChanged check).
  const nowPlayingData = nowPlaying;

  return (
    <ScrollView
      style={styles.outerContainer}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        {/* Header with Status and Info Button */}
        <View style={styles.headerRow}>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: statusInfo.dotColor }]} />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.text}</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.infoButton}
              onPress={() => setShowAboutSheet(true)}
              activeOpacity={0.7}
              accessibilityLabel={t('settings.about.aboutRadio')}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons
                name="information-outline"
                size={22}
                color={colors.secondary}
              />
            </TouchableOpacity>

            {Platform.OS === 'android' && (
              <TouchableOpacity
                style={[styles.infoButton, styles.exitButton]}
                onPress={handleExitApp}
                activeOpacity={0.7}
                accessibilityLabel={t('radio.exitApp')}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="power" size={22} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Now Playing or Radio Name */}
        <NowPlaying
          nowPlaying={nowPlayingData}
          radioName={radioName}
          radioTagline={radioTagline}
          colors={colors}
        />

        {/* Main Controls */}
        <RadioControls
          isPlaying={isPlaying}
          isLoading={isLoading}
          isReconnecting={isReconnecting}
          showExpoGoWarning={showExpoGoWarning}
          volume={volume}
          keepAwake={keepAwake}
          colors={colors}
          isDark={isDark}
          onTogglePlayPause={togglePlayPause}
          onVolumeChange={setVolume}
          onRefresh={handleRefresh}
          onToggleKeepAwake={handleToggleKeepAwake}
        />

        {/* Visualizer */}
        <RadioVisualizer isPlaying={isPlaying} colors={colors} />

        {/* Social Links and Website */}
        <SocialLinks colors={colors} isDark={isDark} onOpenLink={openLink} />

        {/* Info Cards */}
        <RadioInfoCards colors={colors} />

        {/* Daily Schedule - Soundtrack do Dia */}
        <DailyScheduleSection
          schedule={dailySchedule}
          currentPeriod={currentPeriod}
          loading={dailyLoading}
          error={dailyError}
          colors={colors}
          isDark={isDark}
        />

        {/* Weekly Schedule Section */}
        <ScheduleSection
          scheduleByDay={scheduleByDay}
          loading={scheduleLoading}
          error={scheduleError}
          colors={colors}
          isDark={isDark}
          notificationLoading={notificationLoading}
          isShowEnabled={isOptimisticallyEnabled}
          isOperationPending={noOpIsOperationPending}
          onToggleReminder={handleToggleReminder}
          activeReminderCount={optimisticEnabledCount}
          onOpenReminders={handleOpenNotificationSettings}
        />
      </View>

      {/* About Bottom Sheet */}
      <AboutBottomSheet visible={showAboutSheet} onClose={() => setShowAboutSheet(false)} />

      {/* Reminders management bottom sheet — opened by the bell next to play */}
      <RemindersBottomSheet
        visible={showRemindersSheet}
        onClose={() => setShowRemindersSheet(false)}
        enabledShows={Array.from(optimisticEnabledShows)}
        reminderMinutes={notificationPrefs.reminderMinutes}
        isLoading={notificationLoading}
        showTimesByName={showTimesByName}
        onRemoveShow={handleSheetRemoveShow}
        onChangeReminderMinutes={handleSheetChangeMinutes}
        onDisableAll={handleSheetDisableAll}
      />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    outerContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    container: {
      alignItems: 'center',
      padding: 20,
      backgroundColor: colors.background,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      marginBottom: 20,
    },
    headerActions: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
    },
    infoButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.backgroundCard,
      borderWidth: 1,
      borderColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exitButton: {
      borderColor: colors.error + '40',
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundCard,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.muted,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
    },
    statusText: {
      fontSize: 14,
      fontWeight: '600',
    },
  });
}
