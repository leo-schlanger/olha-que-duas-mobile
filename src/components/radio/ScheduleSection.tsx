/**
 * Schedule section component showing weekly programming
 * Programs are grouped by day with sticky-style day headers, today first.
 * Scales gracefully to multiple shows per day.
 */

import React, { memo, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { ThemeColors } from '../../context/ThemeContext';
import { GroupedSchedule, DaySchedule } from '../../hooks/useSchedule';
import { createScheduleStyles } from './styles/radioStyles';

const scheduleIconMap: Record<string, string> = {
  'leaf-outline': 'leaf',
  'bulb-outline': 'lightbulb-on-outline',
  'walk-outline': 'walk',
  'chatbubbles-outline': 'chat-outline',
  'heart-outline': 'heart-outline',
  'people-outline': 'account-group',
  'star-outline': 'star-outline',
};

interface ScheduleItemProps {
  item: GroupedSchedule;
  isLast: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createScheduleStyles>;
  isEnabled: boolean;
  isLoading: boolean;
  isOperationPending: boolean;
  timezone: string;
  onToggleReminder: (item: GroupedSchedule) => void;
}

const ScheduleItem = memo(function ScheduleItem({
  item,
  isLast,
  colors,
  styles,
  isEnabled,
  isLoading,
  isOperationPending,
  timezone,
  onToggleReminder,
}: ScheduleItemProps) {
  const { t } = useTranslation();
  const iconName = scheduleIconMap[item.icon] ?? (item.icon as string);

  return (
    <View style={[styles.item, { borderBottomColor: colors.muted }, isLast && styles.itemLast]}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: colors.background, borderColor: colors.muted },
          item.isLive && { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
        ]}
      >
        {item.iconUrl && !item.iconUrl.includes('placehold.co') ? (
          <Image source={{ uri: item.iconUrl }} style={styles.iconImage} resizeMode="contain" />
        ) : (
          <MaterialCommunityIcons
            name={iconName as keyof typeof MaterialCommunityIcons.glyphMap}
            size={24}
            color={item.isLive ? colors.primary : colors.secondary}
          />
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.row}>
          <Text
            style={[
              styles.showName,
              { color: colors.text },
              item.isLive && { color: colors.primary },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.show}
          </Text>
          {item.isLive && (
            <View style={[styles.liveBadge, { backgroundColor: colors.primary }]}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{t('radio.schedule.liveNow')}</Text>
            </View>
          )}
        </View>
        {item.description ? (
          <Text
            style={[styles.description, { color: colors.textSecondary }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {item.description}
          </Text>
        ) : null}
        <View style={styles.times}>
          {item.times.map((time) => (
            <View key={time} style={[styles.timeBadge, { borderColor: colors.muted }]}>
              <MaterialCommunityIcons name="clock-outline" size={11} color={colors.textSecondary} />
              <Text style={[styles.timeText, { color: colors.text }]}>
                {time} <Text style={{ fontSize: 9, color: colors.textSecondary }}>{timezone}</Text>
              </Text>
            </View>
          ))}
        </View>
      </View>
      <TouchableOpacity
        style={[
          styles.reminderButton,
          { backgroundColor: colors.background, borderColor: colors.secondary },
          isEnabled && { backgroundColor: colors.secondary },
        ]}
        onPress={() => onToggleReminder(item)}
        disabled={isLoading || isOperationPending}
        activeOpacity={0.7}
        accessibilityLabel={`${item.show}${isEnabled ? ' · ' + t('common.active') : ''}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: isLoading || isOperationPending, checked: isEnabled }}
      >
        {isLoading || isOperationPending ? (
          <ActivityIndicator size="small" color={isEnabled ? '#FFFFFF' : colors.secondary} />
        ) : (
          <MaterialCommunityIcons
            name={isEnabled ? 'bell-ring' : 'bell-outline'}
            size={18}
            color={isEnabled ? '#FFFFFF' : colors.secondary}
          />
        )}
      </TouchableOpacity>
    </View>
  );
});

interface DayGroupProps {
  day: DaySchedule;
  colors: ThemeColors;
  styles: ReturnType<typeof createScheduleStyles>;
  notificationLoading: boolean;
  isShowEnabled: (show: string) => boolean;
  isOperationPending: () => boolean;
  timezone: string;
  onToggleReminder: (item: GroupedSchedule) => void;
}

const DayGroup = memo(function DayGroup({
  day,
  colors,
  styles,
  notificationLoading,
  isShowEnabled,
  isOperationPending,
  timezone,
  onToggleReminder,
}: DayGroupProps) {
  const { t } = useTranslation();
  const dayLabel = day.isToday
    ? `${t('radio.schedule.today').toUpperCase()} · ${t(`radio.schedule.daysShort.${day.dayNumber}`)}`
    : t(`radio.schedule.days.${day.dayNumber}`);
  const showCount = t('radio.schedule.showCount', { count: day.shows.length });

  return (
    <View style={styles.dayGroup}>
      <View
        style={[
          styles.dayHeader,
          { backgroundColor: colors.background, borderBottomColor: colors.muted },
          day.isToday && {
            backgroundColor: colors.secondary + '15',
            borderBottomColor: colors.secondary + '40',
          },
        ]}
      >
        <View style={styles.dayHeaderLeft}>
          {day.isToday && <View style={[styles.todayDot, { backgroundColor: colors.secondary }]} />}
          <Text
            style={[
              styles.dayHeaderText,
              { color: colors.text },
              day.isToday && { color: colors.secondary },
            ]}
          >
            {dayLabel}
          </Text>
        </View>
        <Text style={[styles.dayHeaderCount, { color: colors.textSecondary }]}>{showCount}</Text>
      </View>

      {day.shows.map((show, index) => (
        <ScheduleItem
          key={`${show.dayNumber}-${show.show}`}
          item={show}
          isLast={index === day.shows.length - 1}
          colors={colors}
          styles={styles}
          isEnabled={isShowEnabled(show.show)}
          isLoading={notificationLoading}
          isOperationPending={isOperationPending()}
          timezone={timezone}
          onToggleReminder={onToggleReminder}
        />
      ))}
    </View>
  );
});

interface ScheduleSectionProps {
  scheduleByDay: DaySchedule[];
  loading: boolean;
  error?: string | null;
  colors: ThemeColors;
  isDark: boolean;
  notificationLoading: boolean;
  isShowEnabled: (show: string) => boolean;
  isOperationPending: () => boolean;
  onToggleReminder: (item: GroupedSchedule) => void;
  /** Number of shows with active reminders, used for the header bell badge */
  activeReminderCount: number;
  /** Opens the global "manage all reminders" bottom sheet */
  onOpenReminders: () => void;
}

// How many days to show before the "show more" toggle kicks in.
// Today + next 2 = 3 days expanded by default. Enough to feel useful,
// not enough to cause perf issues with large schedules.
const DEFAULT_VISIBLE_DAYS = 3;

export const ScheduleSection = memo(function ScheduleSection({
  scheduleByDay,
  loading,
  error,
  colors,
  isDark,
  notificationLoading,
  isShowEnabled,
  isOperationPending,
  onToggleReminder,
  activeReminderCount,
  onOpenReminders,
}: ScheduleSectionProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createScheduleStyles(colors, isDark), [colors, isDark]);
  const timezone = t('radio.schedule.timezone');
  const [expanded, setExpanded] = useState(false);

  const hasOverflow = scheduleByDay.length > DEFAULT_VISIBLE_DAYS;
  const visibleDays = useMemo(
    () => (expanded || !hasOverflow ? scheduleByDay : scheduleByDay.slice(0, DEFAULT_VISIBLE_DAYS)),
    [scheduleByDay, expanded, hasOverflow]
  );
  const hiddenCount = scheduleByDay.length - DEFAULT_VISIBLE_DAYS;

  const hasActive = activeReminderCount > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="calendar" size={20} color={colors.secondary} />
          <Text style={styles.title}>{t('radio.schedule.title')}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.headerBell,
            {
              backgroundColor: hasActive ? colors.secondary : colors.background,
              borderColor: hasActive ? colors.secondary : colors.muted,
            },
          ]}
          onPress={onOpenReminders}
          activeOpacity={0.7}
          accessibilityLabel={
            hasActive
              ? t('radio.controls.notificationsActive', { count: activeReminderCount })
              : t('radio.controls.configureNotifications')
          }
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name={hasActive ? 'bell-ring' : 'bell-outline'}
            size={18}
            color={hasActive ? '#FFFFFF' : colors.secondary}
          />
          {hasActive && (
            <View style={[styles.headerBellBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.headerBellBadgeText}>{activeReminderCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Error banner — shown when fetch failed but we still render the cached/fallback list */}
      {error && !loading && scheduleByDay.length > 0 ? (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' },
          ]}
        >
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.primary} />
          <Text style={[styles.errorBannerText, { color: colors.primary }]}>
            {t('radio.schedule.loadErrorHint')}
          </Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={colors.secondary} />
            <Text style={styles.loadingText}>{t('radio.schedule.loading')}</Text>
          </View>
        ) : scheduleByDay.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name={error ? 'alert-circle-outline' : 'calendar-blank-outline'}
              size={48}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyStateTitle}>
              {error ? t('radio.schedule.loadError') : t('radio.schedule.noPrograms')}
            </Text>
            <Text style={styles.emptyStateHint}>
              {error ? t('radio.schedule.loadErrorHint') : t('radio.schedule.noProgramsHint')}
            </Text>
          </View>
        ) : (
          <>
            {visibleDays.map((day) => (
              <DayGroup
                key={day.dayNumber}
                day={day}
                colors={colors}
                styles={styles}
                notificationLoading={notificationLoading}
                isShowEnabled={isShowEnabled}
                isOperationPending={isOperationPending}
                timezone={timezone}
                onToggleReminder={onToggleReminder}
              />
            ))}
            {hasOverflow ? (
              <TouchableOpacity
                style={styles.showMoreButton}
                onPress={() => setExpanded((v) => !v)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={
                  expanded ? t('radio.schedule.showLess') : t('radio.schedule.showMore')
                }
              >
                <MaterialCommunityIcons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.secondary}
                />
                <Text style={styles.showMoreText}>
                  {expanded
                    ? t('radio.schedule.showLess')
                    : `${t('radio.schedule.showMore')} (${hiddenCount})`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
});
