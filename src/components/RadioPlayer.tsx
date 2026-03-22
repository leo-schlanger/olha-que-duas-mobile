import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  Image,
  Alert,
  Linking,
} from 'react-native';
import Slider from '@react-native-community/slider';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRadio } from '../hooks/useRadio';
import { useNowPlaying } from '../hooks/useNowPlaying';
import { useTheme } from '../context/ThemeContext';
import { useSchedule, GroupedSchedule } from '../hooks/useSchedule';
import { useNotifications } from '../hooks/useNotifications';
import { useNavigation } from '@react-navigation/native';
import { environment } from '../config/environment';
import { siteConfig } from '../config/site';
import { AboutBottomSheet } from './AboutBottomSheet';

const scheduleIconMap: Record<string, string> = {
  'leaf-outline': 'leaf',
  'bulb-outline': 'lightbulb-on-outline',
  'walk-outline': 'walk',
  'chatbubbles-outline': 'chat-outline',
};

export function RadioPlayer() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();
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

  const { schedule, loading: scheduleLoading } = useSchedule();
  const nowPlaying = useNowPlaying(isPlaying);
  const {
    preferences: notificationPrefs,
    isLoading: notificationLoading,
    scheduleReminder,
    cancelShowReminders,
    isShowEnabled,
  } = useNotifications();

  const [visualizerHeights] = useState(() =>
    [...Array(12)].map(() => new Animated.Value(5)),
  );
  const [showAboutSheet, setShowAboutSheet] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    const animations: Animated.CompositeAnimation[] = [];

    if (isPlaying) {
      interval = setInterval(() => {
        visualizerHeights.forEach((height) => {
          const anim = Animated.timing(height, {
            toValue: Math.random() * 20 + 5,
            duration: 150,
            useNativeDriver: false,
          });
          animations.push(anim);
          anim.start();
        });
      }, 150);
    } else {
      visualizerHeights.forEach((height) => {
        const anim = Animated.timing(height, {
          toValue: 5,
          duration: 300,
          useNativeDriver: false,
        });
        animations.push(anim);
        anim.start();
      });
    }

    return () => {
      if (interval) clearInterval(interval);
      animations.forEach((anim) => anim.stop());
      visualizerHeights.forEach((height) => height.stopAnimation());
    };
  }, [isPlaying, visualizerHeights]);

  const showExpoGoWarning = environment.isExpoGo;

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
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  async function handleToggleReminder(item: GroupedSchedule) {
    const isEnabled = isShowEnabled(item.show);

    if (isEnabled) {
      await cancelShowReminders(item.show);
      Alert.alert(
        'Lembrete removido',
        `O lembrete para "${item.show}" foi desativado.`,
        [{ text: 'OK' }]
      );
    } else {
      let scheduled = false;
      for (const time of item.times) {
        const result = await scheduleReminder(item.show, item.dayNumber, time);
        if (result) {
          scheduled = true;
        }
      }

      if (scheduled) {
        Alert.alert(
          'Lembrete ativado',
          `Receberá uma notificação ${notificationPrefs.reminderMinutes} minutos antes de "${item.show}" começar.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Permissão necessária',
          'Por favor, permita as notificações nas definições do dispositivo para receber lembretes.',
          [{ text: 'OK' }]
        );
      }
    }
  }

  function handleOpenNotificationSettings() {
    (navigation as any).navigate('Settings');
  }

  function handleRefresh() {
    forceReconnect();
  }

  function openLink(url: string) {
    Linking.openURL(url);
  }

  const hasActiveNotifications = notificationPrefs.enabledShows.length > 0;

  return (
    <ScrollView
      style={styles.outerContainer}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        {/* Header with Status and Info Button */}
        <View style={styles.headerRow}>
          <View style={styles.statusBadge}>
            <View
              style={[styles.statusDot, { backgroundColor: statusInfo.dotColor }]}
            />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
              {statusInfo.text}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.infoButton}
            onPress={() => setShowAboutSheet(true)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="information-outline"
              size={22}
              color={colors.secondary}
            />
          </TouchableOpacity>
        </View>

        {/* Now Playing or Radio Name */}
        {nowPlaying.isMusic && nowPlaying.song && !nowPlaying.isTransition ? (
          <View style={styles.nowPlayingContainer}>
            <View style={styles.albumArtContainer}>
              {nowPlaying.song.art ? (
                <Image
                  source={{ uri: nowPlaying.song.art }}
                  style={styles.albumArt}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.albumArt, styles.albumArtFallback]}>
                  <MaterialCommunityIcons
                    name="music-note"
                    size={48}
                    color={colors.secondary}
                  />
                </View>
              )}
            </View>
            <Text style={styles.nowPlayingLabel}>A tocar agora</Text>
            <Text style={styles.songTitle} numberOfLines={2}>
              {nowPlaying.song.title}
            </Text>
            <Text style={styles.songArtist} numberOfLines={1}>
              {nowPlaying.song.artist}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.radioName}>{radioName}</Text>
            <Text style={styles.tagline}>{radioTagline}</Text>
          </>
        )}

        {/* Main Controls: Bell | Play | Refresh */}
        <View style={styles.mainControls}>
          {/* Notification Bell */}
          <TouchableOpacity
            style={[
              styles.sideButton,
              hasActiveNotifications && styles.sideButtonActive,
            ]}
            onPress={handleOpenNotificationSettings}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={hasActiveNotifications ? 'bell-ring' : 'bell-outline'}
              size={24}
              color={hasActiveNotifications ? colors.white : colors.secondary}
            />
            {hasActiveNotifications && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {notificationPrefs.enabledShows.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Play Button */}
          <TouchableOpacity
            style={[styles.playButton, isPlaying && styles.playButtonActive]}
            onPress={togglePlayPause}
            disabled={isLoading || showExpoGoWarning}
            activeOpacity={0.8}
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
            onPress={handleRefresh}
            activeOpacity={0.7}
            disabled={isLoading || isReconnecting}
          >
            <MaterialCommunityIcons
              name="refresh"
              size={24}
              color={isLoading || isReconnecting ? colors.muted : colors.secondary}
            />
          </TouchableOpacity>
        </View>

        {showExpoGoWarning && (
          <View style={styles.expoGoWarning}>
            <MaterialCommunityIcons
              name="information-outline"
              size={20}
              color={colors.vermelho}
            />
            <Text style={styles.expoGoText}>
              Áudio disponível apenas no build nativo.
            </Text>
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
            onValueChange={setVolume}
            minimumTrackTintColor={colors.secondary}
            maximumTrackTintColor={colors.muted}
            thumbTintColor={colors.secondary}
            disabled={showExpoGoWarning}
          />
          <MaterialCommunityIcons
            name="volume-high"
            size={20}
            color={colors.textSecondary}
          />
        </View>

        {/* Visualizer */}
        <View style={styles.visualizer}>
          {visualizerHeights.map((height, i) => (
            <Animated.View
              key={i}
              style={[
                styles.visualizerBar,
                {
                  height,
                  backgroundColor: isPlaying
                    ? colors.secondary
                    : colors.muted,
                },
              ]}
            />
          ))}
        </View>

        {/* Website Button */}
        <TouchableOpacity
          style={styles.websiteButton}
          onPress={() => openLink('https://olhaqueduas.com')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="web" size={20} color={colors.white} />
          <Text style={styles.websiteButtonText}>Visitar Website</Text>
        </TouchableOpacity>

        {/* Social Links */}
        <View style={styles.socialSection}>
          <Text style={styles.socialTitle}>Siga-nos</Text>
          <View style={styles.socialLinks}>
            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: '#E4405F15' }]}
              onPress={() => openLink(siteConfig.social.instagram)}
            >
              <MaterialCommunityIcons name="instagram" size={22} color="#E4405F" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: '#1877F215' }]}
              onPress={() => openLink(siteConfig.social.facebook)}
            >
              <MaterialCommunityIcons name="facebook" size={22} color="#1877F2" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: isDark ? '#FFFFFF15' : '#00000015' }]}
              onPress={() => openLink(siteConfig.social.tiktok)}
            >
              <MaterialCommunityIcons name="music-note" size={22} color={isDark ? '#FFFFFF' : '#000000'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: '#FF000015' }]}
              onPress={() => openLink(siteConfig.social.youtube)}
            >
              <MaterialCommunityIcons name="youtube" size={22} color="#FF0000" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Cards */}
        <View style={styles.infoCards}>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons
              name="music"
              size={24}
              color={colors.secondary}
            />
            <Text style={styles.infoCardTitle}>Alta Qualidade</Text>
            <Text style={styles.infoCardText}>192kbps</Text>
          </View>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={24}
              color={colors.secondary}
            />
            <Text style={styles.infoCardTitle}>Sempre no Ar</Text>
            <Text style={styles.infoCardText}>24/7</Text>
          </View>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons
              name="headphones"
              size={24}
              color={colors.secondary}
            />
            <Text style={styles.infoCardTitle}>Background</Text>
            <Text style={styles.infoCardText}>Ativo</Text>
          </View>
        </View>

        {/* Schedule Section */}
        <View style={styles.scheduleSection}>
          <View style={styles.scheduleHeader}>
            <MaterialCommunityIcons
              name="calendar"
              size={20}
              color={colors.secondary}
            />
            <Text style={styles.scheduleTitle}>Programação Semanal</Text>
          </View>

          <View style={styles.scheduleGrid}>
            {scheduleLoading ? (
              <View style={styles.scheduleLoading}>
                <ActivityIndicator size="small" color={colors.secondary} />
                <Text style={styles.scheduleLoadingText}>
                  Carregando programação...
                </Text>
              </View>
            ) : (
              schedule.map((item, index) => {
                const iconName =
                  scheduleIconMap[item.icon] ?? (item.icon as string);

                return (
                  <View
                    key={`${item.day}-${item.show}`}
                    style={[
                      styles.scheduleItem,
                      index === schedule.length - 1 && styles.scheduleItemLast,
                    ]}
                  >
                    <View style={styles.scheduleIconContainer}>
                      {item.iconUrl &&
                        !item.iconUrl.includes('placehold.co') ? (
                        <Image
                          source={{ uri: item.iconUrl }}
                          style={styles.scheduleIconImage}
                          resizeMode="contain"
                        />
                      ) : (
                        <MaterialCommunityIcons
                          name={iconName as any}
                          size={18}
                          color={colors.secondary}
                        />
                      )}
                    </View>
                    <View style={styles.scheduleInfo}>
                      <View style={styles.scheduleRow}>
                        <Text style={styles.scheduleShowName}>
                          {item.show}
                        </Text>
                        <Text style={styles.scheduleDay}>{item.day}</Text>
                      </View>
                      <View style={styles.scheduleTimes}>
                        {item.times.map((time) => (
                          <View key={time} style={styles.timeBadge}>
                            <MaterialCommunityIcons
                              name="clock-outline"
                              size={10}
                              color={colors.textSecondary}
                            />
                            <Text style={styles.timeText}>{time}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.reminderButton,
                        isShowEnabled(item.show) && styles.reminderButtonActive,
                      ]}
                      onPress={() => handleToggleReminder(item)}
                      disabled={notificationLoading}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons
                        name={isShowEnabled(item.show) ? 'bell-ring' : 'bell-outline'}
                        size={18}
                        color={isShowEnabled(item.show) ? colors.white : colors.secondary}
                      />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </View>

      {/* About Bottom Sheet */}
      <AboutBottomSheet
        visible={showAboutSheet}
        onClose={() => setShowAboutSheet(false)}
      />
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
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      marginBottom: 20,
    },
    infoButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.backgroundCard,
      borderWidth: 1,
      borderColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundCard,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
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
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 8,
    },
    tagline: {
      color: colors.textSecondary,
      fontSize: 16,
      textAlign: 'center',
      marginBottom: 30,
    },
    nowPlayingContainer: {
      alignItems: 'center' as const,
      marginBottom: 30,
    },
    albumArtContainer: {
      marginBottom: 12,
    },
    albumArt: {
      width: 120,
      height: 120,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.muted,
    },
    albumArtFallback: {
      backgroundColor: colors.backgroundCard,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    nowPlayingLabel: {
      fontSize: 11,
      fontWeight: '600' as const,
      color: colors.secondary,
      textTransform: 'uppercase' as const,
      letterSpacing: 1,
      marginBottom: 6,
    },
    songTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '700' as const,
      textAlign: 'center' as const,
      marginBottom: 4,
    },
    songArtist: {
      color: colors.textSecondary,
      fontSize: 15,
      textAlign: 'center' as const,
    },
    mainControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
      gap: 20,
    },
    sideButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.backgroundCard,
      borderWidth: 1,
      borderColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sideButtonActive: {
      backgroundColor: colors.secondary,
      borderColor: colors.secondary,
    },
    notificationBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      backgroundColor: colors.primary,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notificationBadgeText: {
      color: colors.white,
      fontSize: 10,
      fontWeight: '700',
    },
    playButton: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.secondary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: isDark ? colors.secondary : '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.5 : 0.3,
      shadowRadius: 10,
      elevation: 8,
    },
    playButtonActive: {
      backgroundColor: colors.primary,
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
      marginBottom: 24,
    },
    volumeSlider: {
      flex: 1,
      marginHorizontal: 10,
    },
    visualizer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: 30,
      marginBottom: 24,
    },
    visualizerBar: {
      width: 4,
      marginHorizontal: 2,
      borderRadius: 2,
    },
    websiteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 25,
      marginBottom: 24,
      gap: 8,
    },
    websiteButtonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '600',
    },
    socialSection: {
      width: '100%',
      alignItems: 'center',
      marginBottom: 24,
    },
    socialTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 12,
    },
    socialLinks: {
      flexDirection: 'row',
      gap: 12,
    },
    socialButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoCards: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
      marginBottom: 24,
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
      fontWeight: '700',
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
      overflow: 'hidden',
    },
    scheduleIconImage: {
      width: 24,
      height: 24,
    },
    scheduleLoading: {
      padding: 20,
      alignItems: 'center',
      gap: 10,
    },
    scheduleLoadingText: {
      color: colors.textSecondary,
      fontSize: 12,
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
      fontWeight: '700',
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
    reminderButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.secondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
    reminderButtonActive: {
      backgroundColor: colors.secondary,
      borderColor: colors.secondary,
    },
  });
}
