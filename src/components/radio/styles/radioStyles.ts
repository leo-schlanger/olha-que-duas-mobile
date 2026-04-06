/**
 * Shared styles for Radio components
 */

import { StyleSheet } from 'react-native';
import { ThemeColors } from '../../../context/ThemeContext';

export function createRadioControlsStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
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
  });
}

export function createNowPlayingStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
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
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.secondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 6,
    },
    songTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 4,
    },
    songArtist: {
      color: colors.textSecondary,
      fontSize: 15,
      textAlign: 'center',
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
  });
}

export function createVisualizerStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: 30,
      marginBottom: 24,
    },
    bar: {
      width: 4,
      height: 25,
      marginHorizontal: 2,
      borderRadius: 2,
    },
  });
}

export function createSocialStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: '100%',
      alignItems: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 12,
    },
    links: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    button: {
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
  });
}

export function createInfoCardsStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
      marginBottom: 24,
    },
    card: {
      backgroundColor: colors.backgroundCard,
      padding: 15,
      borderRadius: 12,
      alignItems: 'center',
      flex: 1,
      marginHorizontal: 5,
      borderWidth: 1,
      borderColor: colors.muted,
    },
    title: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 8,
    },
    text: {
      color: colors.textSecondary,
      fontSize: 11,
      marginTop: 2,
    },
  });
}

export function createScheduleStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      width: '100%',
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.muted,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 15,
      backgroundColor: isDark ? colors.muted + '30' : colors.muted + '50',
      borderBottomWidth: 1,
      borderBottomColor: colors.muted,
      gap: 10,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    grid: {
      padding: 0,
    },
    loading: {
      padding: 20,
      alignItems: 'center',
      gap: 10,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    // Schedule item styles
    item: {
      flexDirection: 'row',
      padding: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      alignItems: 'flex-start',
      borderLeftWidth: 0,
    },
    itemLast: {
      borderBottomWidth: 0,
    },
    itemToday: {
      borderLeftWidth: 3,
      backgroundColor: isDark ? colors.secondary + '08' : colors.secondary + '06',
    },
    iconContainer: {
      width: 46,
      height: 46,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      marginTop: 2,
      borderWidth: 1,
      overflow: 'hidden',
    },
    iconImage: {
      width: '100%',
      height: '100%',
      borderRadius: 8,
    },
    info: {
      flex: 1,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    showName: {
      fontSize: 15,
      fontWeight: '700',
      flex: 1,
    },
    dayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 6,
    },
    day: {
      fontSize: 12,
      fontWeight: '500',
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      gap: 4,
      marginLeft: 8,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#FFFFFF',
    },
    liveText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    times: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      rowGap: 4,
    },
    timeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      gap: 4,
    },
    timeText: {
      fontSize: 11,
      fontFamily: 'monospace',
    },
    reminderButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
      marginTop: 4,
    },
  });
}
