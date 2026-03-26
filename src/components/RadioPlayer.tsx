import React, { useEffect, useState, useMemo, useRef, useCallback, memo } from 'react';
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
import { useTheme, ThemeColors } from '../context/ThemeContext';
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

// Componente memoizado para item de programação
interface ScheduleItemProps {
  item: GroupedSchedule;
  isLast: boolean;
  colors: ThemeColors;
  isEnabled: boolean;
  isLoading: boolean;
  isOperationPending: boolean;
  onToggleReminder: (item: GroupedSchedule) => void;
}

const ScheduleItem = memo(function ScheduleItem({
  item,
  isLast,
  colors,
  isEnabled,
  isLoading,
  isOperationPending,
  onToggleReminder,
}: ScheduleItemProps) {
  const iconName = scheduleIconMap[item.icon] ?? (item.icon as string);

  return (
    <View
      style={[
        scheduleItemStyles.scheduleItem,
        { borderBottomColor: colors.muted },
        isLast && scheduleItemStyles.scheduleItemLast,
      ]}
    >
      <View style={[scheduleItemStyles.scheduleIconContainer, { backgroundColor: colors.background, borderColor: colors.muted }]}>
        {item.iconUrl && !item.iconUrl.includes('placehold.co') ? (
          <Image
            source={{ uri: item.iconUrl }}
            style={scheduleItemStyles.scheduleIconImage}
            resizeMode="contain"
          />
        ) : (
          <MaterialCommunityIcons
            name={iconName as any}
            size={22}
            color={colors.secondary}
          />
        )}
      </View>
      <View style={scheduleItemStyles.scheduleInfo}>
        <View style={scheduleItemStyles.scheduleRow}>
          <Text style={[scheduleItemStyles.scheduleShowName, { color: colors.text }]}>
            {item.show}
          </Text>
          <Text style={[scheduleItemStyles.scheduleDay, { color: colors.textSecondary }]}>{item.day}</Text>
        </View>
        <View style={scheduleItemStyles.scheduleTimes}>
          {item.times.map((time) => (
            <View key={time} style={[scheduleItemStyles.timeBadge, { backgroundColor: colors.background, borderColor: colors.muted }]}>
              <MaterialCommunityIcons
                name="clock-outline"
                size={10}
                color={colors.textSecondary}
              />
              <Text style={[scheduleItemStyles.timeText, { color: colors.text }]}>{time} <Text style={{ fontSize: 9, color: colors.textSecondary }}>(PT)</Text></Text>
            </View>
          ))}
        </View>
      </View>
      <TouchableOpacity
        style={[
          scheduleItemStyles.reminderButton,
          { backgroundColor: colors.background, borderColor: colors.secondary },
          isEnabled && { backgroundColor: colors.secondary },
        ]}
        onPress={() => onToggleReminder(item)}
        disabled={isLoading || isOperationPending}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name={isEnabled ? 'bell-ring' : 'bell-outline'}
          size={18}
          color={isEnabled ? '#FFFFFF' : colors.secondary}
        />
      </TouchableOpacity>
    </View>
  );
});

// Estilos do ScheduleItem (estáticos, não dependem de theme)
const scheduleItemStyles = StyleSheet.create({
  scheduleItem: {
    flexDirection: 'row',
    padding: 15,
    borderBottomWidth: 1,
    alignItems: 'flex-start',
  },
  scheduleItemLast: {
    borderBottomWidth: 0,
  },
  scheduleIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  scheduleIconImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
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
    flex: 1,
  },
  scheduleDay: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  scheduleTimes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    rowGap: 4,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    gap: 4,
  },
  timeText: {
    fontSize: 10,
    fontFamily: 'monospace',
  },
  reminderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    marginTop: 4,
  },
});

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
    hasPermission,
    scheduleAllTimesForShow,
    cancelShowReminders,
    isShowEnabled,
    requestPermissions,
    isOperationPending,
  } = useNotifications();

  const [visualizerHeights] = useState(() =>
    [...Array(12)].map(() => new Animated.Value(5)),
  );
  const [showAboutSheet, setShowAboutSheet] = useState(false);
  const visualizerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Limpar interval anterior se existir
    if (visualizerIntervalRef.current) {
      clearInterval(visualizerIntervalRef.current);
      visualizerIntervalRef.current = null;
    }

    // Parar todas as animações anteriores
    visualizerHeights.forEach((height) => height.stopAnimation());

    if (isPlaying) {
      visualizerIntervalRef.current = setInterval(() => {
        visualizerHeights.forEach((height) => {
          Animated.timing(height, {
            toValue: Math.random() * 20 + 5,
            duration: 150,
            useNativeDriver: false,
          }).start();
        });
      }, 150);
    } else {
      // Animar de volta ao estado inicial
      visualizerHeights.forEach((height) => {
        Animated.timing(height, {
          toValue: 5,
          duration: 300,
          useNativeDriver: false,
        }).start();
      });
    }

    return () => {
      if (visualizerIntervalRef.current) {
        clearInterval(visualizerIntervalRef.current);
        visualizerIntervalRef.current = null;
      }
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

  const handleToggleReminder = useCallback(async (item: GroupedSchedule) => {
    // Prevenir cliques rápidos / race conditions
    if (isOperationPending()) {
      return;
    }

    const enabled = isShowEnabled(item.show);

    if (enabled) {
      const success = await cancelShowReminders(item.show);
      if (success) {
        Alert.alert(
          'Lembrete removido',
          `O lembrete para "${item.show}" foi desativado.`,
          [{ text: 'OK' }]
        );
      }
    } else {
      // Schedule all times atomically
      const success = await scheduleAllTimesForShow(item.show, item.dayNumber, item.times);

      if (success) {
        Alert.alert(
          'Lembrete ativado',
          `Receberá uma notificação ${notificationPrefs.reminderMinutes} minutos antes de "${item.show}" começar.\n\nO horário será ajustado automaticamente ao seu fuso horário.`,
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
  }, [isOperationPending, isShowEnabled, cancelShowReminders, scheduleAllTimesForShow, notificationPrefs.reminderMinutes]);

  const handleOpenNotificationSettings = useCallback(async () => {
    const activeShows = notificationPrefs.enabledShows;

    if (activeShows.length > 0) {
      // Show summary of active reminders
      const showsList = activeShows.join(', ');
      Alert.alert(
        'Lembretes Ativos',
        `Tem ${activeShows.length} lembrete(s) ativo(s):\n\n${showsList}\n\nRecebe notificações ${notificationPrefs.reminderMinutes} minutos antes de cada programa (horários de Portugal, ajustados ao seu fuso).`,
        [
          { text: 'Gerir nas Definições', onPress: () => (navigation as any).navigate('Settings') },
          { text: 'OK', style: 'cancel' }
        ]
      );
    } else {
      // No active reminders - check permissions and guide user
      if (hasPermission === false) {
        const granted = await requestPermissions();
        if (!granted) {
          Alert.alert(
            'Permissões Necessárias',
            'Para receber lembretes dos programas, precisa permitir notificações nas definições do dispositivo.',
            [
              { text: 'Abrir Definições', onPress: () => Linking.openSettings() },
              { text: 'Cancelar', style: 'cancel' }
            ]
          );
          return;
        }
      }

      Alert.alert(
        'Sem Lembretes Ativos',
        'Pode ativar lembretes tocando no sininho ao lado de cada programa na lista abaixo.',
        [
          { text: 'Ver Definições', onPress: () => (navigation as any).navigate('Settings') },
          { text: 'OK', style: 'cancel' }
        ]
      );
    }
  }, [notificationPrefs.enabledShows, notificationPrefs.reminderMinutes, hasPermission, requestPermissions, navigation]);

  const handleRefresh = useCallback(() => {
    forceReconnect();
  }, [forceReconnect]);

  const openLink = useCallback((url: string) => {
    Linking.openURL(url);
  }, []);

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
              style={[styles.socialButton, { backgroundColor: '#E4405F' }]}
              onPress={() => openLink(siteConfig.social.instagram)}
            >
              <MaterialCommunityIcons name="instagram" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: '#1877F2' }]}
              onPress={() => openLink(siteConfig.social.facebook)}
            >
              <MaterialCommunityIcons name="facebook" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
              onPress={() => openLink(siteConfig.social.tiktok)}
            >
              <MaterialCommunityIcons name="music-note" size={22} color={isDark ? '#000000' : '#FFFFFF'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: '#FF0000' }]}
              onPress={() => openLink(siteConfig.social.youtube)}
            >
              <MaterialCommunityIcons name="youtube" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.communityText}>
            Somos mais do que uma rádio - somos uma comunidade. Cada programa é pensado para trazer valor ao seu dia, seja através de dicas práticas de saúde, inspiração para os seus objetivos ou simplesmente boas conversas para descontrair.
          </Text>
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
              schedule.map((item, index) => (
                <ScheduleItem
                  key={`${item.day}-${item.show}`}
                  item={item}
                  isLast={index === schedule.length - 1}
                  colors={colors}
                  isEnabled={isShowEnabled(item.show)}
                  isLoading={notificationLoading}
                  isOperationPending={isOperationPending()}
                  onToggleReminder={handleToggleReminder}
                />
              ))
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
      marginBottom: 16,
    },
    socialButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    communityText: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textSecondary,
      fontStyle: 'italic',
      textAlign: 'center',
      paddingHorizontal: 8,
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
    scheduleLoading: {
      padding: 20,
      alignItems: 'center',
      gap: 10,
    },
    scheduleLoadingText: {
      color: colors.textSecondary,
      fontSize: 12,
    },
  });
}
