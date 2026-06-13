/**
 * Timeline vertical da programação do dia selecionado.
 * Lista cronológica de TimelineItem, com estados de loading / erro / vazio.
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { ThemeColors } from '../../context/ThemeContext';
import { TimelineItem } from './TimelineItem';
import { TimelineEntry } from './types';

interface TimelineProps {
  items: TimelineEntry[];
  liveStartMins: number | null; // startMins do programa ao vivo (só quando a ver hoje)
  loading: boolean;
  error?: string | null;
  colors: ThemeColors;
  isShowEnabled: (_showName: string) => boolean;
  reminderLoadingShows: Set<string>;
  onToggleReminder: (_entry: TimelineEntry) => void;
}

export const Timeline = memo(function Timeline({
  items,
  liveStartMins,
  loading,
  error,
  colors,
  isShowEnabled,
  reminderLoadingShows,
  onToggleReminder,
}: TimelineProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={colors.secondary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons
          name="calendar-blank-outline"
          size={44}
          color={colors.textSecondary}
        />
        <Text style={styles.emptyText}>{t('schedule.empty')}</Text>
        <Text style={styles.emptyHint}>{t('schedule.emptyHint')}</Text>
      </View>
    );
  }

  return (
    <View>
      {error ? (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.primary} />
          <Text style={styles.errorText}>{t('radio.schedule.loadErrorHint')}</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {items.map((entry, index) => (
          <TimelineItem
            key={entry.key}
            entry={entry}
            isLive={liveStartMins !== null && entry.startMins === liveStartMins}
            isLast={index === items.length - 1}
            colors={colors}
            isReminderOn={!!entry.showName && isShowEnabled(entry.showName)}
            reminderLoading={!!entry.showName && reminderLoadingShows.has(entry.showName)}
            onToggleReminder={onToggleReminder}
          />
        ))}
      </View>
    </View>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: {
      paddingTop: 4,
    },
    center: {
      paddingVertical: 48,
      alignItems: 'center',
      gap: 10,
    },
    emptyText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    emptyHint: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      marginBottom: 12,
      borderRadius: 10,
      backgroundColor: colors.primary + '15',
      borderWidth: 1,
      borderColor: colors.primary + '40',
    },
    errorText: {
      flex: 1,
      fontSize: 12,
      color: colors.primary,
    },
  });
}
