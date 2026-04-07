/**
 * Main RadioPlayer component - orchestrates all radio sub-components
 */

import React, { useState, useMemo, useCallback } from 'react';
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
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { useRadio } from '../hooks/useRadio';
import { radioService } from '../services/radioService';
import { useNowPlaying } from '../hooks/useNowPlaying';
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { useSchedule, GroupedSchedule } from '../hooks/useSchedule';
import { useDailySchedule, getCurrentPeriod } from '../hooks/useDailySchedule';
import { useNotifications } from '../hooks/useNotifications';
import { navigateToTab } from '../navigation/AppNavigator';
import { environment } from '../config/environment';
import { AboutBottomSheet } from './AboutBottomSheet';

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

  const { schedule, loading: scheduleLoading } = useSchedule();
  const { schedule: dailySchedule, loading: dailyLoading } = useDailySchedule();
  const currentPeriod = useMemo(() => getCurrentPeriod(), []);
  const nowPlaying = useNowPlaying(isPlaying);
  const {
    preferences: notificationPrefs,
    isLoading: notificationLoading,
    hasPermission,
    scheduleAllTimesForShow,
    cancelShowReminders,
    isShowEnabled,
    requestPermissions,
    isOperationPending,
  } = useNotifications();

  const [showAboutSheet, setShowAboutSheet] = useState(false);
  const showExpoGoWarning = environment.isExpoGo;

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

  const handleToggleReminder = useCallback(
    async (item: GroupedSchedule) => {
      if (isOperationPending()) return;

      const enabled = isShowEnabled(item.show);

      if (enabled) {
        const success = await cancelShowReminders(item.show);
        if (success) {
          Alert.alert(
            t('notifications.reminderRemoved.title'),
            t('notifications.reminderRemoved.message', { show: item.show }),
            [{ text: t('common.ok') }]
          );
        }
      } else {
        const success = await scheduleAllTimesForShow(item.show, item.dayNumber, item.times);

        if (success) {
          Alert.alert(
            t('notifications.reminderActivated.title'),
            t('notifications.reminderActivated.message', {
              minutes: notificationPrefs.reminderMinutes,
              show: item.show,
            }),
            [{ text: t('common.ok') }]
          );
        } else {
          Alert.alert(
            t('notifications.permissionRequired.title'),
            t('notifications.permissionRequired.message'),
            [{ text: t('common.ok') }]
          );
        }
      }
    },
    [
      isOperationPending,
      isShowEnabled,
      cancelShowReminders,
      scheduleAllTimesForShow,
      notificationPrefs.reminderMinutes,
      t,
    ]
  );

  const handleOpenNotificationSettings = useCallback(async () => {
    const activeShows = notificationPrefs.enabledShows;

    if (activeShows.length > 0) {
      const showsList = activeShows.join(', ');
      Alert.alert(
        t('notifications.activeReminders.title'),
        t('notifications.activeReminders.message', {
          count: activeShows.length,
          shows: showsList,
          minutes: notificationPrefs.reminderMinutes,
        }),
        [
          { text: t('common.manageInSettings'), onPress: () => navigateToTab('Settings') },
          { text: t('common.ok'), style: 'cancel' },
        ]
      );
    } else {
      if (hasPermission === false) {
        const granted = await requestPermissions();
        if (!granted) {
          Alert.alert(
            t('notifications.permissionsRequired.title'),
            t('notifications.permissionsRequired.message'),
            [
              { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
              { text: t('common.cancel'), style: 'cancel' },
            ]
          );
          return;
        }
      }

      Alert.alert(
        t('notifications.noActiveReminders.title'),
        t('notifications.noActiveReminders.message'),
        [
          { text: t('common.viewSettings'), onPress: () => navigateToTab('Settings') },
          { text: t('common.ok'), style: 'cancel' },
        ]
      );
    }
  }, [
    notificationPrefs.enabledShows,
    notificationPrefs.reminderMinutes,
    hasPermission,
    requestPermissions,
    t,
  ]);

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

  const hasActiveNotifications = notificationPrefs.enabledShows.length > 0;

  // Transform nowPlaying data for the component
  const nowPlayingData = useMemo(
    () => ({
      isMusic: nowPlaying.isMusic,
      isTransition: nowPlaying.isTransition,
      song: nowPlaying.song
        ? {
            title: nowPlaying.song.title,
            artist: nowPlaying.song.artist,
            art: nowPlaying.song.art,
          }
        : null,
    }),
    [nowPlaying.isMusic, nowPlaying.isTransition, nowPlaying.song]
  );

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
          hasActiveNotifications={hasActiveNotifications}
          notificationCount={notificationPrefs.enabledShows.length}
          colors={colors}
          isDark={isDark}
          onTogglePlayPause={togglePlayPause}
          onVolumeChange={setVolume}
          onRefresh={handleRefresh}
          onNotificationPress={handleOpenNotificationSettings}
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
          colors={colors}
          isDark={isDark}
        />

        {/* Weekly Schedule Section */}
        <ScheduleSection
          schedule={schedule}
          loading={scheduleLoading}
          colors={colors}
          isDark={isDark}
          notificationLoading={notificationLoading}
          isShowEnabled={isShowEnabled}
          isOperationPending={isOperationPending}
          onToggleReminder={handleToggleReminder}
        />
      </View>

      {/* About Bottom Sheet */}
      <AboutBottomSheet visible={showAboutSheet} onClose={() => setShowAboutSheet(false)} />
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
      width: 40,
      height: 40,
      borderRadius: 20,
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
