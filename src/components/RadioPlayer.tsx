/**
 * Main RadioPlayer component - orchestrates all radio sub-components
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { useSchedule } from '../hooks/useSchedule';
import {
  useDailySchedule,
  getCurrentPeriod,
  DailyPeriod,
  parsePeriodRange,
  parseSlotTime,
  addDurations,
} from '../hooks/useDailySchedule';
import { logger } from '../utils/logger';
import { environment } from '../config/environment';
import { AboutBottomSheet } from './AboutBottomSheet';

const KEEP_AWAKE_TAG = 'olhaqueduas-radio';

const DAY_NAMES: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

/**
 * Merge today's special programs (from weekly schedule) into the daily
 * periods. Special programs get an `iconUrl` to render their logo; routine
 * slots remain icon-less. Ported from the web sister project.
 */
function mergeTodayPrograms(
  periods: DailyPeriod[],
  scheduleByDay: { dayName: string; shows: { show: string; times: string[]; iconUrl: string }[] }[]
): DailyPeriod[] {
  const todayName = DAY_NAMES[new Date().getDay()];
  const todayDay = scheduleByDay.find((d) => d.dayName === todayName);
  if (!todayDay || todayDay.shows.length === 0) return periods;

  const merged: DailyPeriod[] = periods.map((p) => ({
    ...p,
    slots: [...p.slots],
  }));

  for (const prog of todayDay.shows) {
    for (const rawTime of prog.times) {
      const [h, m] = rawTime.split(':').map(Number);
      const mins = h * 60 + (m || 0);

      const target = merged.find((p) => {
        const range = parsePeriodRange(p.range);
        return range ? mins >= range.start && mins < range.end : false;
      });
      if (!target) continue;

      const formatted = m
        ? `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`
        : `${String(h).padStart(2, '0')}h`;

      const existingIdx = target.slots.findIndex((s) => parseSlotTime(s.time) === mins);
      const specialSlot = {
        time: formatted,
        name: prog.show,
        iconUrl: prog.iconUrl,
      };

      if (existingIdx >= 0) {
        target.slots[existingIdx] = specialSlot;
      } else {
        target.slots.push(specialSlot);
      }

      target.slots.sort((a, b) => parseSlotTime(a.time) - parseSlotTime(b.time));
    }
  }

  return addDurations(merged);
}

import {
  RadioControls,
  NowPlaying,
  RadioVisualizer,
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

  const { scheduleByDay } = useSchedule();
  const { schedule: dailySchedule, loading: dailyLoading, error: dailyError } = useDailySchedule();
  const [currentPeriod, setCurrentPeriod] = useState(() => getCurrentPeriod());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setCurrentPeriod(getCurrentPeriod());
      }
    });
    return () => sub.remove();
  }, []);

  const nowPlaying = useNowPlaying(isPlaying);

  const [showAboutSheet, setShowAboutSheet] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const showExpoGoWarning = environment.isExpoGo;

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

  useEffect(() => {
    return () => {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // ignore
      }
    };
  }, []);

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

  // Merge today's special programs into daily schedule
  const mergedSchedule = useMemo(
    () => mergeTodayPrograms(dailySchedule, scheduleByDay),
    [dailySchedule, scheduleByDay]
  );

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

        {/* Daily Schedule with merged programs */}
        <DailyScheduleSection
          schedule={mergedSchedule}
          currentPeriod={currentPeriod}
          loading={dailyLoading}
          error={dailyError}
          colors={colors}
          isDark={isDark}
        />

        {/* TODO: Reminders/notifications — reimplementar se público pedir */}
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
