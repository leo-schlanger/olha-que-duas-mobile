/**
 * Radio playback controls - play/pause, volume, notifications, refresh
 */

import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Slider from '@react-native-community/slider';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { RadioControlsProps } from './types';
import { createRadioControlsStyles } from './styles/radioStyles';

export const RadioControls = memo(function RadioControls({
  isPlaying,
  isLoading,
  isReconnecting = false,
  showExpoGoWarning,
  volume,
  hasActiveNotifications,
  notificationCount,
  colors,
  isDark,
  onTogglePlayPause,
  onVolumeChange,
  onRefresh,
  onNotificationPress,
}: RadioControlsProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createRadioControlsStyles(colors, isDark), [colors, isDark]);

  return (
    <>
      {/* Main Controls: Bell | Play | Refresh */}
      <View style={styles.mainControls}>
        {/* Notification Bell */}
        <TouchableOpacity
          style={[styles.sideButton, hasActiveNotifications && styles.sideButtonActive]}
          onPress={onNotificationPress}
          activeOpacity={0.7}
          accessibilityLabel={
            hasActiveNotifications
              ? t('radio.controls.notificationsActive', { count: notificationCount })
              : t('radio.controls.configureNotifications')
          }
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name={hasActiveNotifications ? 'bell-ring' : 'bell-outline'}
            size={24}
            color={hasActiveNotifications ? colors.white : colors.secondary}
          />
          {hasActiveNotifications && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{notificationCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Play Button */}
        <TouchableOpacity
          style={[styles.playButton, isPlaying && styles.playButtonActive]}
          onPress={onTogglePlayPause}
          disabled={isLoading || showExpoGoWarning}
          activeOpacity={0.8}
          accessibilityLabel={isPlaying ? t('radio.controls.pause') : t('radio.controls.play')}
          accessibilityRole="button"
          accessibilityState={{ disabled: isLoading || showExpoGoWarning }}
        >
          {isLoading || isReconnecting ? (
            <ActivityIndicator size="large" color={colors.background} />
          ) : (
            <MaterialCommunityIcons
              name={isPlaying ? 'pause' : 'play'}
              size={44}
              color={colors.background}
            />
          )}
        </TouchableOpacity>

        {/* Refresh Button */}
        <TouchableOpacity
          style={styles.sideButton}
          onPress={onRefresh}
          activeOpacity={0.7}
          disabled={isLoading || isReconnecting}
          accessibilityLabel={t('common.retry')}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name="refresh"
            size={24}
            color={isLoading || isReconnecting ? colors.muted : colors.secondary}
          />
        </TouchableOpacity>
      </View>

      {/* Expo Go Warning */}
      {showExpoGoWarning && (
        <View style={styles.expoGoWarning}>
          <MaterialCommunityIcons name="information-outline" size={20} color={colors.vermelho} />
          <Text style={styles.expoGoText}>{t('radio.controls.expoGoWarning')}</Text>
        </View>
      )}

      {/* Volume Control */}
      <View style={styles.volumeContainer}>
        <MaterialCommunityIcons
          name={volume === 0 ? 'volume-mute' : 'volume-low'}
          size={20}
          color={colors.textSecondary}
        />
        <Slider
          style={styles.volumeSlider}
          minimumValue={0}
          maximumValue={1}
          value={volume}
          onValueChange={onVolumeChange}
          minimumTrackTintColor={colors.secondary}
          maximumTrackTintColor={colors.muted}
          thumbTintColor={colors.secondary}
          disabled={showExpoGoWarning}
          accessibilityLabel={t('radio.controls.volume')}
          accessibilityRole="adjustable"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(volume * 100) }}
        />
        <MaterialCommunityIcons name="volume-high" size={20} color={colors.textSecondary} />
      </View>
    </>
  );
});
