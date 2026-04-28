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
  DailySlot,
  parsePeriodRange,
  parseSlotTime,
  addDurations,
} from '../hooks/useDailySchedule';
import { logger } from '../utils/logger';
import { environment } from '../config/environment';
import { AboutBottomSheet } from './AboutBottomSheet';

const KEEP_AWAKE_TAG = 'olhaqueduas-radio';

/**
 * Merge today's special programs (from weekly schedule) into the daily
 * periods. Special programs get an `iconUrl` to render their logo; routine
 * slots remain icon-less. Ported from the web sister project.
 */
/** Format minutes-from-midnight as "12h" or "12h30" */
function formatMinsToSlotTime(totalMins: number): string {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return m
    ? `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`
    : `${String(h).padStart(2, '0')}h`;
}

function mergeTodayPrograms(
  periods: DailyPeriod[],
  scheduleByDay: {
    dayName: string;
    isToday?: boolean;
    shows: {
      show: string;
      times: string[];
      endTimes?: (string | null)[];
      isAllDay?: boolean;
      iconUrl: string;
    }[];
  }[]
): DailyPeriod[] {
  const todayDay = scheduleByDay.find((d) => d.isToday);
  if (!todayDay || todayDay.shows.length === 0) return periods;

  // Keep original periods for gap-filling
  const originalPeriods = periods;

  const merged: DailyPeriod[] = periods.map((p) => ({
    ...p,
    slots: [...p.slots],
  }));

  const allDayProg = todayDay.shows.find((p) => p.isAllDay);

  if (allDayProg) {
    const allDaySlot: DailySlot = {
      time: '—',
      name: allDayProg.show,
      iconUrl: allDayProg.iconUrl,
      isAllDay: true,
    };
    for (const period of merged) {
      period.slots = period.slots.filter((s) => !!s.iconUrl);
      period.slots.unshift({ ...allDaySlot });
    }
  }

  const specialsWithEnd: { periodIdx: number; endMins: number }[] = [];

  for (const prog of todayDay.shows) {
    if (prog.isAllDay) continue;

    for (let i = 0; i < prog.times.length; i++) {
      const rawTime = prog.times[i];
      const rawEndTime = prog.endTimes?.[i] ?? null;

      const [h, m] = rawTime.split(':').map(Number);
      const mins = h * 60 + (m || 0);

      const periodIdx = merged.findIndex((p) => {
        const range = parsePeriodRange(p.range);
        return range ? mins >= range.start && mins < range.end : false;
      });
      if (periodIdx < 0) continue;
      const target = merged[periodIdx];

      const formatted = formatMinsToSlotTime(mins);

      let duration: string | undefined;
      let endMins: number | undefined;
      if (rawEndTime) {
        const [eh, em] = rawEndTime.split(':').map(Number);
        endMins = eh * 60 + (em || 0);
        let diff = endMins - mins;
        if (diff <= 0) diff += 24 * 60;
        const dh = Math.floor(diff / 60);
        const dm = diff % 60;
        duration =
          dh === 0 ? `${dm}min` : dm > 0 ? `${dh}h${String(dm).padStart(2, '0')}` : `${dh}h`;
      }

      const existingIdx = target.slots.findIndex(
        (s) => !s.isAllDay && parseSlotTime(s.time) === mins
      );
      const specialSlot: DailySlot = {
        time: formatted,
        name: prog.show,
        iconUrl: prog.iconUrl,
        ...(duration && { duration }),
      };

      if (existingIdx >= 0) {
        target.slots[existingIdx] = specialSlot;
      } else {
        target.slots.push(specialSlot);
      }

      if (endMins !== undefined) {
        specialsWithEnd.push({ periodIdx, endMins });
      }
    }
  }

  // Sort all periods
  for (const period of merged) {
    period.slots.sort((a, b) => {
      if (a.isAllDay) return -1;
      if (b.isAllDay) return 1;
      return parseSlotTime(a.time) - parseSlotTime(b.time);
    });
  }

  // Gap-fill: after each special with end_time, insert a "resume" slot if there's dead air
  for (const { periodIdx, endMins } of specialsWithEnd) {
    const target = merged[periodIdx];
    const range = parsePeriodRange(target.range);
    if (!range) continue;

    if (endMins >= range.end || endMins < range.start) continue;

    const alreadyExists = target.slots.some(
      (s) => !s.isAllDay && parseSlotTime(s.time) === endMins
    );
    if (alreadyExists) continue;

    const nextSlot = target.slots.find((s) => !s.isAllDay && parseSlotTime(s.time) > endMins);
    const nextStart = nextSlot ? parseSlotTime(nextSlot.time) : range.end;
    if (endMins >= nextStart) continue;

    let resumeSlot: DailySlot;
    if (allDayProg) {
      resumeSlot = {
        time: formatMinsToSlotTime(endMins),
        name: allDayProg.show,
        iconUrl: allDayProg.iconUrl,
      };
    } else {
      const origPeriod = originalPeriods.find((p) => {
        const r = parsePeriodRange(p.range);
        return r ? endMins >= r.start && endMins < r.end : false;
      });
      const origSlots = origPeriod?.slots ?? [];
      const covering = origSlots.filter((s) => parseSlotTime(s.time) <= endMins);
      const origSlot = covering[covering.length - 1];

      resumeSlot = {
        time: formatMinsToSlotTime(endMins),
        name: origSlot?.name ?? 'Programação',
      };
    }

    target.slots.push(resumeSlot);

    target.slots.sort((a, b) => {
      if (a.isAllDay) return -1;
      if (b.isAllDay) return 1;
      return parseSlotTime(a.time) - parseSlotTime(b.time);
    });
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
