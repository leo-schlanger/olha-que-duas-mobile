/**
 * Botão de sino de lembrete para um programa.
 * Reflete o estado on/off e mostra um spinner enquanto a operação decorre.
 */

import React, { memo } from 'react';
import { TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ThemeColors } from '../../context/ThemeContext';

interface ReminderBellProps {
  enabled: boolean;
  loading: boolean;
  onPress: () => void;
  colors: ThemeColors;
  accessibilityLabel: string;
}

export const ReminderBell = memo(function ReminderBell({
  enabled,
  loading,
  onPress,
  colors,
  accessibilityLabel,
}: ReminderBellProps) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: enabled ? colors.secondary + '25' : colors.muted + '30',
          borderColor: enabled ? colors.secondary + '50' : colors.muted,
        },
      ]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: enabled }}
      accessibilityLabel={accessibilityLabel}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.secondary} />
      ) : (
        <MaterialCommunityIcons
          name={enabled ? 'bell-ring' : 'bell-outline'}
          size={18}
          color={enabled ? colors.secondary : colors.textSecondary}
        />
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
