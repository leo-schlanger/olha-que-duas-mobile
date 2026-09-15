/**
 * Aba Programação — calendário de eventos/horários da rádio.
 *
 * Layout (estilo BBC Sounds / TuneIn):
 *   1. Hero "Agora no ar" (programa/slot ativo + progresso)
 *   2. Seletor de dias (chips HOJE + dias seguintes)
 *   3. Timeline vertical do dia selecionado, com sino de lembrete nos especiais
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar,
  TouchableOpacity,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useSchedule } from '../hooks/useSchedule';
import { useDailySchedule } from '../hooks/useDailySchedule';
import { useNotifications } from '../hooks/useNotifications';
import { useLiveProgram } from '../hooks/useLiveProgram';
import { getPtDayNumber } from '../utils/ptTime';
import { mergeProgramsForDay } from '../utils/scheduleMerge';
import { buildTimelineEntries } from '../utils/scheduleTimeline';
import { describeWeeklyOccurrences } from '../utils/scheduleLabels';
import { NowOnAirHero, DaySelector, Timeline } from '../components/schedule';
import { TimelineEntry, DayOption } from '../components/schedule/types';
import { RemindersBottomSheet } from '../components/RemindersBottomSheet';

export function ScheduleScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const toast = useToast();

  const { schedule, scheduleByDay, loading, error, fromCache, refresh } = useSchedule();
  const {
    schedule: dailySchedule,
    loading: dailyLoading,
    error: dailyError,
    refresh: refreshDaily,
  } = useDailySchedule();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshDaily()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshDaily]);
  const {
    preferences,
    isShowEnabled,
    scheduleShowOccurrences,
    cancelShowReminders,
    setReminderMinutes,
    cancelAllReminders,
    isLoading: notificationsLoading,
  } = useNotifications();

  const live = useLiveProgram(scheduleByDay, dailySchedule);

  // "Hoje" em fuso de Portugal, recalculado ao voltar do background (cobre a
  // viragem da meia-noite com a app aberta). Mantém-se alinhado com useSchedule.
  const [todayNum, setTodayNum] = useState(() => getPtDayNumber());
  const [selectedDay, setSelectedDay] = useState(todayNum);
  const [showReminders, setShowReminders] = useState(false);
  const [reminderLoadingShows, setReminderLoadingShows] = useState<Set<string>>(new Set());
  // Espelho síncrono do Set para barrar taps concorrentes no MESMO programa
  // antes do re-render propagar o `disabled` ao sino.
  const inFlightShows = useRef<Set<string>>(new Set());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const nt = getPtDayNumber();
      setTodayNum((prev) => {
        // Se o utilizador ainda estava a ver "hoje", segue para o novo dia.
        setSelectedDay((sel) => (sel === prev ? nt : sel));
        return nt;
      });
    });
    return () => sub.remove();
  }, []);

  // Rótulos dos dias (curtos), reativos ao idioma
  const dayLabels = useMemo<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    for (let i = 0; i <= 6; i++) map[i] = t(`radio.schedule.daysShort.${i}`);
    return map;
  }, [t]);

  // Seletor de dias: hoje primeiro, depois a semana em frente
  const days = useMemo<DayOption[]>(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const dayNumber = (todayNum + i) % 7;
        return { dayNumber, label: dayLabels[dayNumber], isToday: i === 0 };
      }),
    [todayNum, dayLabels]
  );

  // Ocorrências de cada programa especial na semana (para agendar lembretes em todos os dias)
  const showOccurrences = useMemo(() => {
    const m = new Map<string, { dayNumber: number; times: string[] }[]>();
    for (const item of schedule) {
      if (item.isAllDay || !item.times || item.times.length === 0) continue;
      const arr = m.get(item.show) ?? [];
      arr.push({ dayNumber: item.dayNumber, times: item.times });
      m.set(item.show, arr);
    }
    return m;
  }, [schedule]);

  // Quando passa cada programa, agrupado por hora (para o RemindersBottomSheet):
  // "Noite de JAZZ" → ["DOM–QUA, SÁB · 20h"]
  const showTimesByName = useMemo(() => {
    const everyDay = t('schedule.everyDay');
    const m = new Map<string, string[]>();
    for (const [show, occurrences] of showOccurrences) {
      m.set(show, describeWeeklyOccurrences(occurrences, dayLabels, everyDay));
    }
    return m;
  }, [showOccurrences, dayLabels, t]);

  // Timeline pré-calculada por dia (lookup instantâneo ao trocar de chip)
  const entriesByDay = useMemo(() => {
    const labels = { program: t('schedule.program'), music: t('schedule.music') };
    const defaultSlotName = t('radio.schedule.defaultSlotName');
    const map = new Map<number, TimelineEntry[]>();

    for (const day of days) {
      const dayShows = scheduleByDay.find((d) => d.dayNumber === day.dayNumber)?.shows ?? [];
      const merged = mergeProgramsForDay(dailySchedule, dayShows, defaultSlotName);
      map.set(day.dayNumber, buildTimelineEntries(day.dayNumber, merged, labels));
    }
    return map;
  }, [days, scheduleByDay, dailySchedule, t]);

  const currentEntries = entriesByDay.get(selectedDay) ?? [];
  const liveStartMins = selectedDay === todayNum && live.live ? live.live.startMins : null;

  // Ativa/desativa o lembrete de um programa (todas as ocorrências da semana)
  const toggleReminderForShow = useCallback(
    async (showName: string) => {
      // Guard síncrono contra taps concorrentes no mesmo programa.
      if (inFlightShows.current.has(showName)) return;
      inFlightShows.current.add(showName);
      setReminderLoadingShows((prev) => new Set(prev).add(showName));
      try {
        const enabled = isShowEnabled(showName);
        if (enabled) {
          const ok = await cancelShowReminders(showName);
          if (ok)
            toast.show(t('schedule.reminderRemoved', { show: showName }), { variant: 'success' });
          else toast.show(t('notifications.toggleError'), { variant: 'error' });
        } else {
          const occurrences = (showOccurrences.get(showName) ?? []).map((o) => ({
            dayOfWeek: o.dayNumber,
            times: o.times,
          }));
          const result = await scheduleShowOccurrences(showName, occurrences);
          if (result.ok) {
            toast.show(t('schedule.reminderAdded', { show: showName }), { variant: 'success' });
          } else if (result.error === 'Permission not granted') {
            // Permissão negada: a mensagem (e o caminho para Definições) está
            // no banner permanente da secção de notificações em Definições.
            toast.show(t('schedule.reminderPermission'), { variant: 'error' });
          } else {
            // 'Operation in progress' ou falha genérica — NÃO é problema de permissão.
            toast.show(t('notifications.toggleError'), { variant: 'error' });
          }
        }
      } finally {
        inFlightShows.current.delete(showName);
        setReminderLoadingShows((prev) => {
          const next = new Set(prev);
          next.delete(showName);
          return next;
        });
      }
    },
    [isShowEnabled, cancelShowReminders, scheduleShowOccurrences, showOccurrences, toast, t]
  );

  const handleToggleEntry = useCallback(
    (entry: TimelineEntry) => {
      if (entry.showName) toggleReminderForShow(entry.showName);
    },
    [toggleReminderForShow]
  );

  const heroReminder = useMemo(() => {
    if (!live.live?.isSpecial || live.live.isAllDay || !live.live.name) return undefined;
    const showName = live.live.name;
    if (!showOccurrences.has(showName)) return undefined;
    return {
      enabled: isShowEnabled(showName),
      loading: reminderLoadingShows.has(showName),
      onPress: () => toggleReminderForShow(showName),
    };
  }, [live.live, showOccurrences, isShowEnabled, reminderLoadingShows, toggleReminderForShow]);

  const styles = useMemo(() => createStyles(colors), [colors]);
  const reminderCount = preferences.enabledShows.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('tabs.schedule')}</Text>
        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => setShowReminders(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.myReminders.title')}
        >
          <MaterialCommunityIcons
            name={reminderCount > 0 ? 'bell-ring' : 'bell-outline'}
            size={24}
            color={colors.secondary}
          />
          {reminderCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{reminderCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressBackgroundColor={colors.backgroundCard}
          />
        }
      >
        <NowOnAirHero
          live={live.live}
          progress={live.progress}
          minutesRemaining={live.minutesRemaining}
          hasProgress={live.hasProgress}
          colors={colors}
          isDark={isDark}
          reminder={heroReminder}
        />

        <DaySelector
          days={days}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          colors={colors}
        />

        <View style={styles.timelineWrap}>
          <Timeline
            items={currentEntries}
            liveStartMins={liveStartMins}
            loading={(loading || dailyLoading) && currentEntries.length === 0}
            error={error ?? dailyError}
            fromCache={fromCache}
            colors={colors}
            isShowEnabled={isShowEnabled}
            reminderLoadingShows={reminderLoadingShows}
            onToggleReminder={handleToggleEntry}
          />
        </View>
      </ScrollView>

      <RemindersBottomSheet
        visible={showReminders}
        onClose={() => setShowReminders(false)}
        enabledShows={preferences.enabledShows}
        reminderMinutes={preferences.reminderMinutes}
        isLoading={notificationsLoading}
        showTimesByName={showTimesByName}
        onRemoveShow={cancelShowReminders}
        onChangeReminderMinutes={setReminderMinutes}
        onDisableAll={cancelAllReminders}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.muted,
    },
    headerTitle: { color: colors.text, fontSize: 28, fontWeight: 'bold' },
    bellButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.backgroundCard,
      borderWidth: 1,
      borderColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: 4,
      right: 4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    scroll: { flex: 1 },
    scrollContent: { paddingTop: 12, paddingBottom: 40 },
    timelineWrap: { paddingHorizontal: 16, paddingTop: 12 },
  });
}
