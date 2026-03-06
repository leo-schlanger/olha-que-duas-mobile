import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useRadio } from '../hooks/useRadio';
import { useTheme } from '../context/ThemeContext';
import { siteConfig } from '../config/site';

/**
 * Radio player component with play/pause controls, volume slider, and weekly schedule
 * Supports background playback and reconnection status
 */
export function RadioPlayer() {
  const { colors, isDark } = useTheme();
  const {
    isPlaying,
    isLoading,
    isReconnecting,
    reconnectAttempt,
    volume,
    radioName,
    radioTagline,
    togglePlayPause,
    setVolume,
    forceReconnect,
    isInitialized,
  } = useRadio();

  // Animated values for visualizer
  const [visualizerHeights] = useState(() =>
    [...Array(12)].map(() => new Animated.Value(5))
  );

  // Animate visualizer when playing
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isPlaying) {
      interval = setInterval(() => {
        visualizerHeights.forEach((height) => {
          Animated.timing(height, {
            toValue: Math.random() * 20 + 5,
            duration: 150,
            useNativeDriver: false,
          }).start();
        });
      }, 150);
    } else {
      visualizerHeights.forEach((height) => {
        Animated.timing(height, {
          toValue: 5,
          duration: 300,
          useNativeDriver: false,
        }).start();
      });
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, visualizerHeights]);

  // If we are in Expo Go, we show a friendly message as radio won't play
  const isExpoGo = !isInitialized && !isLoading;

  // Determine the status text and color
  const getStatusInfo = () => {
    if (isReconnecting) {
      return {
        text: `A reconectar... (${reconnectAttempt}/10)`,
        color: colors.secondary,
        dotColor: colors.secondary,
      };
    }
    if (isLoading) {
      return {
        text: 'A carregar...',
        color: colors.textSecondary,
        dotColor: colors.secondary,
      };
    }
    if (isPlaying) {
      return {
        text: 'No Ar',
        color: colors.success,
        dotColor: colors.success,
      };
    }
    return {
      text: 'Offline',
      color: colors.textSecondary,
      dotColor: colors.textSecondary,
    };
  };

  const statusInfo = getStatusInfo();
  const styles = createStyles(colors, isDark);

  return (
    <ScrollView
      style={styles.outerContainer}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        {/* Status Badge */}
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: statusInfo.dotColor }]} />
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.text}
          </Text>
        </View>

        {/* Radio Info */}
        <Text style={styles.radioName}>{radioName}</Text>
        <Text style={styles.tagline}>{radioTagline}</Text>

        {/* Play Button */}
        <TouchableOpacity
          style={[styles.playButton, isPlaying && styles.playButtonActive]}
          onPress={togglePlayPause}
          disabled={isLoading || isExpoGo}
          activeOpacity={0.8}
        >
          {isLoading || isReconnecting ? (
            <ActivityIndicator size="large" color={colors.background} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={40}
              color={colors.background}
            />
          )}
        </TouchableOpacity>

        {/* Reconnect Button (shown when reconnecting fails) */}
        {isReconnecting && reconnectAttempt && reconnectAttempt >= 5 && (
          <TouchableOpacity
            style={styles.reconnectButton}
            onPress={forceReconnect}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={styles.reconnectButtonText}>Tentar Novamente</Text>
          </TouchableOpacity>
        )}

        {isExpoGo && (
          <View style={styles.expoGoWarning}>
            <Ionicons name="information-circle-outline" size={20} color={colors.vermelho} />
            <Text style={styles.expoGoText}>
              Áudio disponível apenas no build nativo.
            </Text>
          </View>
        )}

        {/* Volume Control */}
        <View style={styles.volumeContainer}>
          <Ionicons
            name={volume === 0 ? 'volume-mute' : 'volume-low'}
            size={20}
            color={colors.textSecondary}
          />
          <Slider
            style={styles.volumeSlider}
            minimumValue={0}
            maximumValue={1}
            value={volume}
            onValueChange={setVolume}
            minimumTrackTintColor={colors.secondary}
            maximumTrackTintColor={colors.muted}
            thumbTintColor={colors.secondary}
            disabled={isExpoGo}
          />
          <Ionicons
            name="volume-high"
            size={20}
            color={colors.textSecondary}
          />
        </View>

        {/* Audio Visualizer (animated) */}
        <View style={styles.visualizer}>
          {visualizerHeights.map((height, i) => (
            <Animated.View
              key={i}
              style={[
                styles.visualizerBar,
                {
                  height,
                  backgroundColor: isPlaying ? colors.secondary : colors.muted,
                },
              ]}
            />
          ))}
        </View>

        {/* Info Cards */}
        <View style={styles.infoCards}>
          <View style={styles.infoCard}>
            <Ionicons name="musical-notes" size={24} color={colors.secondary} />
            <Text style={styles.infoCardTitle}>Alta Qualidade</Text>
            <Text style={styles.infoCardText}>192kbps</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="time" size={24} color={colors.secondary} />
            <Text style={styles.infoCardTitle}>Sempre no Ar</Text>
            <Text style={styles.infoCardText}>24/7</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="headset" size={24} color={colors.secondary} />
            <Text style={styles.infoCardTitle}>Background</Text>
            <Text style={styles.infoCardText}>Ativo</Text>
          </View>
        </View>

        {/* Weekly Schedule Section */}
        <View style={styles.scheduleSection}>
          <View style={styles.scheduleHeader}>
            <Ionicons name="calendar" size={20} color={colors.secondary} />
            <Text style={styles.scheduleTitle}>Programacao Semanal</Text>
          </View>

          <View style={styles.scheduleGrid}>
            {siteConfig.radio.schedule.map((item, index) => (
              <View key={item.day} style={[
                styles.scheduleItem,
                index === siteConfig.radio.schedule.length - 1 && styles.scheduleItemLast
              ]}>
                <View style={styles.scheduleIconContainer}>
                  <Ionicons name={item.icon as any} size={18} color={colors.secondary} />
                </View>
                <View style={styles.scheduleInfo}>
                  <View style={styles.scheduleRow}>
                    <Text style={styles.scheduleShowName}>{item.show}</Text>
                    <Text style={styles.scheduleDay}>{item.day}</Text>
                  </View>
                  <View style={styles.scheduleTimes}>
                    {item.times.map(time => (
                      <View key={time} style={styles.timeBadge}>
                        <Ionicons name="time-outline" size={10} color={colors.textSecondary} />
                        <Text style={styles.timeText}>{time}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    outerContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    container: {
      alignItems: 'center',
      padding: 20,
      backgroundColor: colors.background,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundCard,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.muted,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
    },
    statusText: {
      fontSize: 14,
      fontWeight: '600',
    },
    radioName: {
      color: colors.text,
      fontSize: 28,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 8,
    },
    tagline: {
      color: colors.textSecondary,
      fontSize: 16,
      textAlign: 'center',
      marginBottom: 30,
    },
    playButton: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.secondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
      shadowColor: isDark ? colors.secondary : '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.5 : 0.3,
      shadowRadius: 10,
      elevation: 8,
    },
    playButtonActive: {
      backgroundColor: colors.primary,
    },
    reconnectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.vermelho,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      marginBottom: 15,
      gap: 6,
    },
    reconnectButtonText: {
      color: colors.white,
      fontSize: 13,
      fontWeight: '600',
    },
    expoGoWarning: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.vermelho + '15',
      padding: 10,
      borderRadius: 10,
      marginBottom: 20,
      gap: 8,
    },
    expoGoText: {
      color: colors.vermelho,
      fontSize: 12,
      fontWeight: '500',
    },
    volumeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      paddingHorizontal: 20,
      marginBottom: 30,
    },
    volumeSlider: {
      flex: 1,
      marginHorizontal: 10,
    },
    visualizer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: 30,
      marginBottom: 30,
    },
    visualizerBar: {
      width: 4,
      marginHorizontal: 2,
      borderRadius: 2,
    },
    infoCards: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
      marginBottom: 40,
    },
    infoCard: {
      backgroundColor: colors.backgroundCard,
      padding: 15,
      borderRadius: 12,
      alignItems: 'center',
      flex: 1,
      marginHorizontal: 5,
      borderWidth: 1,
      borderColor: colors.muted,
    },
    infoCardTitle: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 8,
    },
    infoCardText: {
      color: colors.textSecondary,
      fontSize: 11,
      marginTop: 2,
    },
    scheduleSection: {
      width: '100%',
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.muted,
      marginTop: 10,
    },
    scheduleHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 15,
      backgroundColor: isDark ? colors.muted + '30' : colors.muted + '50',
      borderBottomWidth: 1,
      borderBottomColor: colors.muted,
      gap: 10,
    },
    scheduleTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
    },
    scheduleGrid: {
      padding: 0,
    },
    scheduleItem: {
      flexDirection: 'row',
      padding: 15,
      borderBottomWidth: 1,
      borderBottomColor: colors.muted,
      alignItems: 'center',
    },
    scheduleItemLast: {
      borderBottomWidth: 0,
    },
    scheduleIconContainer: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      borderWidth: 1,
      borderColor: colors.muted,
    },
    scheduleInfo: {
      flex: 1,
    },
    scheduleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    scheduleShowName: {
      fontSize: 14,
      fontWeight: 'bold',
      color: colors.text,
      flex: 1,
    },
    scheduleDay: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    scheduleTimes: {
      flexDirection: 'row',
      gap: 6,
    },
    timeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.muted,
      gap: 4,
    },
    timeText: {
      fontSize: 10,
      color: colors.text,
      fontFamily: 'monospace',
    },
  });
}
