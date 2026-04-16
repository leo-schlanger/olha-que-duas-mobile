/**
 * Shared types for Radio components
 */

import { ThemeColors } from '../../context/ThemeContext';
import type { NowPlayingData } from '../../services/nowPlayingService';

export interface RadioStatusInfo {
  text: string;
  color: string;
  dotColor: string;
}

// Re-exported so existing consumers keep importing it from `radio/types`.
export type { NowPlayingData } from '../../services/nowPlayingService';
export type { NowPlayingSong as SongInfo } from '../../services/nowPlayingService';

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
