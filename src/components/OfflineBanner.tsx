/**
 * Offline banner shown when network is unavailable
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNetwork } from '../context/NetworkContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

export function OfflineBanner() {
  const { isConnected } = useNetwork();
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (isConnected) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.error }]} accessibilityRole="alert">
      <MaterialCommunityIcons name="wifi-off" size={16} color={colors.white} />
      <Text style={[styles.text, { color: colors.white }]}>{t('common.offline')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    gap: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
});
