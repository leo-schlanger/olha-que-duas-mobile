/**
 * Hero "AGORA NO AR" — card destacado no topo da aba Programação.
 * Mostra o programa/slot ativo, artwork, horário, badge AO VIVO pulsante
 * (programas especiais) e barra de progresso (decorrido/restante).
 */

import React, { memo, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, AccessibilityInfo } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { ThemeColors } from '../../context/ThemeContext';
import { ProgramIcon } from './ProgramIcon';
import { ReminderBell } from './ReminderBell';
import { LiveProgram } from '../../hooks/useLiveProgram';

interface NowOnAirHeroProps {
  live: LiveProgram | null;
  progress: number;
  minutesRemaining: number;
  hasProgress: boolean;
  colors: ThemeColors;
  isDark: boolean;
  reminder?: { enabled: boolean; loading: boolean; onPress: () => void };
}

export const NowOnAirHero = memo(function NowOnAirHero({
  live,
  progress,
  minutesRemaining,
  hasProgress,
  colors,
  isDark,
  reminder,
}: NowOnAirHeroProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const pulse = useRef(new Animated.Value(1)).current;
  const showLiveBadge = !!live?.isSpecial;

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;

    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled || reduceMotion || !showLiveBadge) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      loop.start();
    });

    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse, showLiveBadge]);

  if (!live) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>{t('schedule.nowOnAir')}</Text>
        <View style={styles.emptyRow}>
          <MaterialCommunityIcons name="radio" size={28} color={colors.textSecondary} />
          <Text style={styles.emptyText}>{t('schedule.nothingOnAir')}</Text>
        </View>
      </View>
    );
  }

  const pct = Math.round(progress * 100);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.label}>{t('schedule.nowOnAir')}</Text>
        {showLiveBadge && (
          <View style={styles.liveBadge}>
            <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
            <Text style={styles.liveText}>{t('radio.schedule.liveNow')}</Text>
          </View>
        )}
      </View>

      <View style={styles.mainRow}>
        <ProgramIcon name={live.name} iconUrl={live.iconUrl ?? ''} size={64} colors={colors} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {live.name}
          </Text>
          {live.isAllDay ? (
            <Text style={styles.time}>{t('radio.schedule.allDay')}</Text>
          ) : live.timeLabel ? (
            <Text style={styles.time}>{live.timeLabel}</Text>
          ) : null}
        </View>
        {reminder && live.isSpecial ? (
          <ReminderBell
            enabled={reminder.enabled}
            loading={reminder.loading}
            onPress={reminder.onPress}
            colors={colors}
            accessibilityLabel={t('schedule.reminderFor', { show: live.name })}
          />
        ) : null}
      </View>

      {hasProgress && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.remaining}>
            {t('schedule.remaining', { count: minutesRemaining })}
          </Text>
        </View>
      )}
    </View>
  );
});

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 18,
      padding: 18,
      marginHorizontal: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.muted,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    label: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.primary + '1A',
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    liveText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.primary,
    },
    mainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    info: {
      flex: 1,
    },
    name: {
      fontSize: 19,
      fontWeight: '800',
      color: colors.text,
    },
    time: {
      fontSize: 13,
      fontFamily: 'monospace',
      color: colors.textSecondary,
      marginTop: 4,
    },
    progressWrap: {
      marginTop: 16,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? colors.muted + '50' : colors.muted,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    remaining: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 6,
      textAlign: 'right',
    },
    emptyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    emptyText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
  });
}
