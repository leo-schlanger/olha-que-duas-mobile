/**
 * Shared types for Radio components
 */

import { ThemeColors } from '../../context/ThemeContext';

export interface RadioStatusInfo {
  text: string;
  color: string;
  dotColor: string;
}

export interface SongInfo {
  title: string;
  artist: string;
  art?: string;
}

export interface NowPlayingData {
  isMusic: boolean;
  isTransition: boolean;
  song: SongInfo | null;
}

export interface RadioControlsProps {
  isPlaying: boolean;
  isLoading: boolean;
  isReconnecting?: boolean;
  showExpoGoWarning: boolean;
  volume: number;
  hasActiveNotifications: boolean;
  notificationCount: number;
  colors: ThemeColors;
  isDark: boolean;
  onTogglePlayPause: () => void;
  onVolumeChange: (value: number) => void;
  onRefresh: () => void;
  onNotificationPress: () => void;
}

export interface NowPlayingProps {
  nowPlaying: NowPlayingData;
  radioName: string;
  radioTagline: string;
  colors: ThemeColors;
}

export interface RadioVisualizerProps {
  isPlaying: boolean;
  colors: ThemeColors;
}

export interface SocialLinksProps {
  colors: ThemeColors;
  isDark: boolean;
  onOpenLink: (url: string) => void;
}

export interface RadioInfoCardsProps {
  colors: ThemeColors;
}
