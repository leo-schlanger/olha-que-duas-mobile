/**
 * Schedule section component showing weekly programming
 * Features: today highlighting, live indicator, improved layout
 */

import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { ThemeColors } from '../../context/ThemeContext';
import { GroupedSchedule } from '../../hooks/useSchedule';
import { createScheduleStyles } from './styles/radioStyles';

const scheduleIconMap: Record<string, string> = {
  'leaf-outline': 'leaf',
  'bulb-outline': 'lightbulb-on-outline',
  'walk-outline': 'walk',
  'chatbubbles-outline': 'chat-outline',
  'heart-outline': 'heart-outline',
  'people-outline': 'account-group',
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
    <View
      style={[
        styles.item,
        { borderBottomColor: colors.muted },
        isLast && styles.itemLast,
        item.isToday && styles.itemToday,
        item.isToday && { borderLeftColor: colors.secondary },
      ]}
    >
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
        <View style={styles.dayRow}>
          <MaterialCommunityIcons name="calendar" size={12} color={colors.textSecondary} />
          <Text
            style={[
              styles.day,
              { color: colors.textSecondary },
              item.isToday && { color: colors.secondary, fontWeight: '700' },
            ]}
          >
            {item.isToday ? t('radio.schedule.today') : item.day}
          </Text>
        </View>
        <View style={styles.times}>
          {item.times.map((time) => (
            <View
              key={time}
              style={[
                styles.timeBadge,
                { backgroundColor: colors.background, borderColor: colors.muted },
              ]}
            >
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
      >
        <MaterialCommunityIcons
          name={isEnabled ? 'bell-ring' : 'bell-outline'}
          size={18}
          color={isEnabled ? '#FFFFFF' : colors.secondary}
        />
      </TouchableOpacity>
    </View>
  );
});

interface ScheduleSectionProps {
  schedule: GroupedSchedule[];
  loading: boolean;
  colors: ThemeColors;
  isDark: boolean;
  notificationLoading: boolean;
  isShowEnabled: (show: string) => boolean;
  isOperationPending: () => boolean;
  onToggleReminder: (item: GroupedSchedule) => void;
}

export const ScheduleSection = memo(function ScheduleSection({
  schedule,
  loading,
  colors,
  isDark,
  notificationLoading,
  isShowEnabled,
  isOperationPending,
  onToggleReminder,
}: ScheduleSectionProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createScheduleStyles(colors, isDark), [colors, isDark]);
  const timezone = t('radio.schedule.timezone');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="calendar" size={20} color={colors.secondary} />
        <Text style={styles.title}>{t('radio.schedule.title')}</Text>
      </View>

      <View style={styles.grid}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={colors.secondary} />
            <Text style={styles.loadingText}>{t('radio.schedule.loading')}</Text>
          </View>
        ) : schedule.length === 0 ? (
          <View style={styles.loading}>
            <Text style={styles.loadingText}>{t('radio.schedule.noPrograms')}</Text>
          </View>
        ) : (
          schedule.map((item, index) => (
            <ScheduleItem
              key={`${item.day}-${item.show}`}
              item={item}
              isLast={index === schedule.length - 1}
              colors={colors}
              styles={styles}
              isEnabled={isShowEnabled(item.show)}
              isLoading={notificationLoading}
              isOperationPending={isOperationPending()}
              timezone={timezone}
              onToggleReminder={onToggleReminder}
            />
          ))
        )}
      </View>
    </View>
  );
});
