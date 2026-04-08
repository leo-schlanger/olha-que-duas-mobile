/**
 * Daily schedule section - "A Tua Soundtrack do Dia"
 * Shows 4 time periods (Manhã, Tarde, Noite, Madrugada) in a 2x2 grid
 * Highlights the current period with accent styling
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { ThemeColors } from '../../context/ThemeContext';
import { DailyPeriod } from '../../hooks/useDailySchedule';

const PERIOD_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  manha: 'white-balance-sunny',
  tarde: 'weather-sunset-down',
  noite: 'moon-waning-crescent',
  madrugada: 'weather-night',
};

interface DailyScheduleSectionProps {
  schedule: DailyPeriod[];
  currentPeriod: string;
  loading: boolean;
  colors: ThemeColors;
  isDark: boolean;
}

const PeriodCard = memo(function PeriodCard({
  period,
  isCurrent,
  colors,
  isDark,
  nowLabel,
}: {
  period: DailyPeriod;
  isCurrent: boolean;
  colors: ThemeColors;
  isDark: boolean;
  nowLabel: string;
}) {
  const icon = PERIOD_ICONS[period.period] || 'music';
  const styles = useMemo(
    () => createCardStyles(colors, isDark, isCurrent),
    [colors, isDark, isCurrent]
  );

  return (
    <View style={styles.card}>
      {isCurrent && (
        <View style={styles.nowBadge}>
          <View style={styles.nowDot} />
          <Text style={styles.nowText}>{nowLabel}</Text>
        </View>
      )}

      <View style={styles.cardHeader}>
        <View style={styles.iconBox}>
          <MaterialCommunityIcons
            name={icon}
            size={16}
            color={isCurrent ? colors.secondary : colors.textSecondary}
          />
        </View>
        <View style={styles.headerText}>
          <Text
            style={[styles.periodLabel, isCurrent && { color: colors.secondary }]}
            numberOfLines={1}
          >
            {period.label}
          </Text>
          <Text style={styles.periodRange}>{period.range}</Text>
        </View>
      </View>

      <View style={styles.slots}>
        {period.slots.map((slot) => (
          <View key={slot.time} style={styles.slotRow}>
            <Text style={[styles.slotTime, isCurrent && { color: colors.secondary + 'CC' }]}>
              {slot.time}
            </Text>
            <Text style={styles.slotName} numberOfLines={1}>
              {slot.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

export const DailyScheduleSection = memo(function DailyScheduleSection({
  schedule,
  currentPeriod,
  loading,
  colors,
  isDark,
}: DailyScheduleSectionProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createSectionStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="music-note" size={18} color={colors.secondary} />
          <Text style={styles.title}>{t('radio.dailySchedule.title')}</Text>
        </View>
        <Text style={styles.badge}>24H</Text>
      </View>

      <View style={styles.content}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={colors.secondary} />
          </View>
        ) : (
          <View style={styles.grid}>
            {schedule.map((period) => (
              <PeriodCard
                key={period.period}
                period={period}
                isCurrent={currentPeriod === period.period}
                colors={colors}
                isDark={isDark}
                nowLabel={t('radio.dailySchedule.now')}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
});

function createSectionStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      width: '100%',
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.muted,
      marginBottom: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 15,
      backgroundColor: isDark ? colors.muted + '30' : colors.muted + '50',
      borderBottomWidth: 1,
      borderBottomColor: colors.muted,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    badge: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.secondary,
      letterSpacing: 1.5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: colors.secondary + '15',
      overflow: 'hidden',
    },
    content: {
      padding: 12,
    },
    loading: {
      padding: 20,
      alignItems: 'center',
    },
    grid: {
      gap: 10,
    },
  });
}

function createCardStyles(colors: ThemeColors, isDark: boolean, isCurrent: boolean) {
  return StyleSheet.create({
    card: {
      width: '100%',
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      backgroundColor: isCurrent
        ? colors.primary + '12'
        : isDark
          ? colors.muted + '20'
          : colors.background,
      borderColor: isCurrent ? colors.secondary + '40' : colors.muted,
    },
    nowBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: colors.secondary + '25',
    },
    nowDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.secondary,
    },
    nowText: {
      fontSize: 8,
      fontWeight: '800',
      color: colors.secondary,
      letterSpacing: 0.5,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    iconBox: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isCurrent ? colors.secondary + '20' : colors.muted + '40',
    },
    headerText: {
      flex: 1,
    },
    periodLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    periodRange: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    slots: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    slotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    slotTime: {
      fontSize: 11,
      fontFamily: 'monospace',
      color: colors.textSecondary,
      width: 38,
    },
    slotName: {
      fontSize: 12,
      color: colors.text + 'CC',
      flex: 1,
    },
  });
}
