/**
 * Uma linha da timeline da programação: rail de hora à esquerda (início e
 * fim), artwork (programas especiais), nome + subtítulo, badge AO VIVO quando
 * aplicável e sino de lembrete (só especiais).
 *
 * Nomes e subtítulos NUNCA são cortados com "...": quebram para as linhas
 * que forem precisas.
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemeColors } from '../../context/ThemeContext';
import { ProgramIcon } from './ProgramIcon';
import { ReminderBell } from './ReminderBell';
import { TimelineEntry } from './types';

interface TimelineItemProps {
  entry: TimelineEntry;
  isLive: boolean;
  isLast: boolean;
  colors: ThemeColors;
  isReminderOn: boolean;
  reminderLoading: boolean;
  onToggleReminder: (_entry: TimelineEntry) => void;
}

export const TimelineItem = memo(function TimelineItem({
  entry,
  isLive,
  isLast,
  colors,
  isReminderOn,
  reminderLoading,
  onToggleReminder,
}: TimelineItemProps) {
  const { t } = useTranslation();
  const styles = useMemo(
    () => createStyles(colors, isLive, entry.isSpecial),
    [colors, isLive, entry.isSpecial]
  );

  return (
    <View style={styles.row}>
      {/* Rail de hora */}
      <View style={styles.rail}>
        {entry.isAllDay ? (
          <MaterialDayBadge colors={colors} label={t('radio.schedule.allDay')} />
        ) : (
          <>
            <Text style={styles.time} maxFontSizeMultiplier={1.4}>
              {entry.time}
            </Text>
            {entry.endTime ? (
              <Text style={styles.endTime} maxFontSizeMultiplier={1.4}>
                {entry.endTime}
              </Text>
            ) : null}
          </>
        )}
        <View style={styles.railLineWrap}>
          <View style={styles.dot} />
          {!isLast && <View style={styles.line} />}
        </View>
      </View>

      {/* Conteúdo */}
      <View style={styles.content}>
        {entry.iconUrl || entry.isSpecial ? (
          <ProgramIcon name={entry.name} iconUrl={entry.iconUrl ?? ''} size={44} colors={colors} />
        ) : null}

        <View style={styles.texts}>
          <View style={styles.titleRow}>
            <Text style={styles.name}>{entry.name}</Text>
            {isLive && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{t('radio.schedule.liveNow')}</Text>
              </View>
            )}
          </View>
          {entry.subtitle ? <Text style={styles.subtitle}>{entry.subtitle}</Text> : null}
        </View>

        {entry.isSpecial && entry.showName ? (
          <ReminderBell
            enabled={isReminderOn}
            loading={reminderLoading}
            onPress={() => onToggleReminder(entry)}
            colors={colors}
            accessibilityLabel={t('schedule.reminderFor', { show: entry.name })}
          />
        ) : null}
      </View>
    </View>
  );
});

function MaterialDayBadge({ colors, label }: { colors: ThemeColors; label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: colors.accent + '20',
      }}
    >
      <Text
        style={{
          fontSize: 8,
          fontWeight: '800',
          color: colors.accent,
          letterSpacing: 0.3,
          textAlign: 'center',
        }}
        maxFontSizeMultiplier={1.4}
      >
        {label}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors, isLive: boolean, isSpecial: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    rail: {
      width: 52,
      alignItems: 'center',
    },
    time: {
      fontSize: 12,
      fontFamily: 'monospace',
      fontWeight: '600',
      color: isLive ? colors.secondary : colors.textSecondary,
    },
    endTime: {
      fontSize: 10,
      fontFamily: 'monospace',
      color: colors.textSecondary,
      opacity: 0.8,
    },
    railLineWrap: {
      marginTop: 4,
      flex: 1,
      alignItems: 'center',
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: isLive ? colors.secondary : colors.muted,
      borderWidth: 2,
      borderColor: isLive ? colors.secondary : colors.muted,
    },
    line: {
      flex: 1,
      width: 2,
      backgroundColor: colors.muted,
      marginTop: 2,
    },
    content: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      gap: 12,
      marginBottom: 14,
      padding: isSpecial || isLive ? 12 : 8,
      borderRadius: 14,
      backgroundColor: isLive
        ? colors.primary + '12'
        : isSpecial
          ? colors.secondary + '0E'
          : 'transparent',
      borderWidth: isLive || isSpecial ? 1 : 0,
      borderColor: isLive ? colors.secondary + '40' : colors.secondary + '20',
    },
    texts: {
      flex: 1,
      minWidth: 0,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    name: {
      fontSize: isSpecial ? 15 : 14,
      fontWeight: isSpecial ? '700' : '500',
      color: isLive ? colors.text : isSpecial ? colors.text : colors.text + 'DD',
      flexShrink: 1,
      lineHeight: isSpecial ? 20 : 19,
    },
    subtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: colors.primary + '20',
    },
    liveDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    liveText: {
      fontSize: 8,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.5,
    },
  });
}
