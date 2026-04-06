/**
 * Reusable menu item with icon and optional subtitle
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ThemeColors } from '../../context/ThemeContext';

interface MenuItemProps {
  icon: string;
  title: string;
  subtitle?: string;
  colors: ThemeColors;
  onPress: () => void;
  showExternal?: boolean;
  isLast?: boolean;
}

export function MenuItem({
  icon,
  title,
  subtitle,
  colors,
  onPress,
  showExternal,
  isLast,
}: MenuItemProps) {
  return (
    <TouchableOpacity
      style={[
        styles.menuItem,
        { borderBottomColor: colors.background },
        isLast && styles.menuItemLast,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.menuIconBox, { backgroundColor: colors.muted }]}>
        <MaterialCommunityIcons
          name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
          size={20}
          color={colors.text}
        />
      </View>
      <View style={styles.menuContent}>
        <Text style={[styles.menuTitle, { color: colors.text }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        )}
      </View>
      <MaterialCommunityIcons
        name={showExternal ? 'open-in-new' : 'chevron-right'}
        size={18}
        color={colors.textSecondary}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuContent: {
    flex: 1,
    marginLeft: 12,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  menuSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
});
