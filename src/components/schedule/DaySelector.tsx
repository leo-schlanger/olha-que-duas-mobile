/**
 * Seletor horizontal de dias (chips): HOJE + dias seguintes da semana.
 */

import React, { memo, useMemo } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemeColors } from '../../context/ThemeContext';
import { DayOption } from './types';

interface DaySelectorProps {
  days: DayOption[];
  selectedDay: number;
  onSelectDay: (_dayNumber: number) => void;
  colors: ThemeColors;
}

export const DaySelector = memo(function DaySelector({
  days,
  selectedDay,
  onSelectDay,
  colors,
}: DaySelectorProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(), []);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {days.map((day) => {
        const selected = day.dayNumber === selectedDay;
        const label = day.isToday ? t('schedule.today') : day.label;
        return (
          <TouchableOpacity
            key={day.dayNumber}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.primary : colors.backgroundCard,
                borderColor: selected ? colors.primary : colors.muted,
              },
            ]}
            onPress={() => onSelectDay(day.dayNumber)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
          >
            <Text style={[styles.chipText, { color: selected ? colors.white : colors.text }]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
});

function createStyles() {
  return StyleSheet.create({
    container: {
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 4,
    },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 20,
      borderWidth: 1,
      minWidth: 56,
      alignItems: 'center',
    },
    chipText: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
  });
}
