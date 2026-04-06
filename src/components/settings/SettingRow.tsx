/**
 * Reusable setting row with switch toggle
 */

import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ThemeColors } from '../../context/ThemeContext';

interface SettingRowProps {
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  colors: ThemeColors;
  value: boolean;
  onValueChange: (_value: boolean) => void;
  disabled?: boolean;
  isLast?: boolean;
}

export function SettingRow({
  icon,
  iconColor,
  title,
  subtitle,
  colors,
  value,
  onValueChange,
  disabled,
  isLast,
}: SettingRowProps) {
  return (
    <View
      style={[
        styles.settingRow,
        { borderBottomColor: colors.background },
        isLast && styles.settingRowLast,
      ]}
    >
      <View style={[styles.settingIconBox, { backgroundColor: iconColor + '15' }]}>
        <MaterialCommunityIcons
          name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
          size={20}
          color={iconColor}
        />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.muted, true: iconColor + '60' }}
        thumbColor={value ? iconColor : colors.textSecondary}
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  settingIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  settingSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
});
