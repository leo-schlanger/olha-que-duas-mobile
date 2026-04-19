/**
 * Daily schedule section - "A Tua Soundtrack do Dia"
 * Shows 4 time periods (Manhã, Tarde, Noite, Madrugada) with slots.
 * Special program slots (with iconUrl from weekly schedule merge) get
 * highlighted styling and a program logo.
 */

import React, { memo, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { ThemeColors } from '../../context/ThemeContext';
import { DailyPeriod, DailySlot } from '../../hooks/useDailySchedule';

const PERIOD_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  manha: 'white-balance-sunny',
  tarde: 'weather-sunset-down',
  noite: 'moon-waning-crescent',
  madrugada: 'weather-night',
};

const FALLBACK_PROGRAM_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  'Nutrição': 'leaf',
  'Motivar': 'lightbulb-on-outline',
  'Prazer Feminino': 'heart-outline',
  'Companheiros de Caminho': 'walk',
  'Companheiros de Caminhada': 'walk',
  'Dizem que...': 'chat-outline',
  'Olha que Duas!': 'account-group',
  'Céu de cada mês': 'star-outline',
};

function ProgramIcon({
  name,
  iconUrl,
  size,
  colors,
}: {
  name: string;
  iconUrl: string;
  size: number;
  colors: ThemeColors;
}) {
  const [errored, setErrored] = useState(false);
  const hasUrl = iconUrl && !iconUrl.includes('placehold.co');
  const fallbackIcon = FALLBACK_PROGRAM_ICONS[name] || ('radio' as keyof typeof MaterialCommunityIcons.glyphMap);

  if (!hasUrl || errored) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          backgroundColor: colors.secondary + '20',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons
          name={fallbackIcon}
          size={size * 0.55}
          color={colors.secondary}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: iconUrl }}
      style={{ width: size, height: size, borderRadius: 8 }}
      contentFit="cover"
      cachePolicy="memory-disk"
      onError={() => setErrored(true)}
    />
  );
}

const SlotRow = memo(function SlotRow({
  slot,
  isCurrent,
  colors,
  isDark,
}: {
  slot: DailySlot;
  isCurrent: boolean;
  colors: ThemeColors;
  isDark: boolean;
}) {
  const isSpecial = !!slot.iconUrl;
  const s = useMemo(() => createSlotStyles(colors, isDark, isCurrent, isSpecial), [colors, isDark, isCurrent, isSpecial]);

  return (
    <View style={s.container}>
      <Text style={s.time}>{slot.time}</Text>
      {isSpecial && (
        <ProgramIcon name={slot.name} iconUrl={slot.iconUrl!} size={32} colors={colors} />
      )}
      <Text style={s.name} numberOfLines={isSpecial ? 2 : 1}>
        {slot.name}
      </Text>
      {slot.duration ? <Text style={s.duration}>{slot.duration}</Text> : null}
    </View>
  );
});

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
          <SlotRow
            key={slot.time}
            slot={slot}
            isCurrent={isCurrent}
            colors={colors}
            isDark={isDark}
          />
        ))}
      </View>
    </View>
  );
});

interface DailyScheduleSectionProps {
  schedule: DailyPeriod[];
  currentPeriod: string;
  loading: boolean;
  error?: string | null;
  colors: ThemeColors;
  isDark: boolean;
}

export const DailyScheduleSection = memo(function DailyScheduleSection({
  schedule,
  currentPeriod,
  loading,
  error,
  colors,
  isDark,
}: DailyScheduleSectionProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createSectionStyles(colors, isDark), [colors, isDark]);
  const isEmpty = !loading && schedule.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="music-note" size={18} color={colors.secondary} />
          <Text style={styles.title}>{t('radio.dailySchedule.title')}</Text>
        </View>
        <Text style={styles.badge}>24H</Text>
      </View>

      {error && !loading && schedule.length > 0 ? (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' },
          ]}
        >
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.primary} />
          <Text style={[styles.errorBannerText, { color: colors.primary }]}>
            {t('radio.schedule.loadErrorHint')}
          </Text>
        </View>
      ) : null}

      <View style={styles.content}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={colors.secondary} />
          </View>
        ) : isEmpty ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="music-note-off" size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyStateText, { color: colors.text }]}>
              {t('radio.schedule.noPrograms')}
            </Text>
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
    emptyState: {
      padding: 24,
      alignItems: 'center',
      gap: 10,
    },
    emptyStateText: {
      fontSize: 13,
      fontWeight: '500',
      textAlign: 'center',
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      marginHorizontal: 12,
      marginTop: 10,
      borderRadius: 8,
      borderWidth: 1,
    },
    errorBannerText: {
      flex: 1,
      fontSize: 11,
      fontWeight: '500',
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
      gap: 6,
    },
  });
}

function createSlotStyles(
  colors: ThemeColors,
  _isDark: boolean,
  isCurrent: boolean,
  isSpecial: boolean
) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      ...(isSpecial
        ? {
            backgroundColor: colors.secondary + '10',
            borderWidth: 1,
            borderColor: colors.secondary + '25',
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 8,
            marginHorizontal: -4,
          }
        : {}),
    },
    time: {
      fontSize: isSpecial ? 12 : 11,
      fontFamily: 'monospace',
      color: isCurrent ? colors.secondary + 'CC' : colors.textSecondary,
      width: isSpecial ? 46 : 38,
    },
    name: {
      flex: 1,
      fontSize: isSpecial ? 14 : 12,
      fontWeight: isSpecial ? '700' : '400',
      color: isSpecial ? colors.secondary : colors.text + 'CC',
    },
    duration: {
      fontSize: 10,
      fontFamily: 'monospace',
      color: isCurrent
        ? colors.secondary + '90'
        : isSpecial
          ? colors.secondary + '80'
          : colors.textSecondary + '80',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: isCurrent
        ? colors.secondary + '15'
        : isSpecial
          ? colors.secondary + '10'
          : colors.muted + '30',
      overflow: 'hidden',
    },
  });
}
