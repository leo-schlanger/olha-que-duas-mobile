/**
 * Now playing display component showing current song or radio info
 */

import React, { memo, useMemo } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { NowPlayingProps } from './types';
import { createNowPlayingStyles } from './styles/radioStyles';

// Cross-fade duration when the album art swaps. expo-image handles this
// natively — much smoother than the old manual transition window.
const ART_TRANSITION_MS = 350;

export const NowPlaying = memo(function NowPlaying({
  nowPlaying,
  radioName,
  radioTagline,
  colors,
}: NowPlayingProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createNowPlayingStyles(colors), [colors]);

  // Show song info as soon as it's available. No more "transition" gap that
  // used to fall back to the radio name — expo-image cross-fades the art
  // change, so the swap looks intentional instead of laggy.
  if (nowPlaying.isMusic && nowPlaying.song) {
    return (
      <View style={styles.container}>
        <View style={styles.albumArtContainer}>
          {nowPlaying.song.art ? (
            <Image
              source={{ uri: nowPlaying.song.art }}
              style={styles.albumArt}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={ART_TRANSITION_MS}
              priority="high"
            />
          ) : (
            <View style={[styles.albumArt, styles.albumArtFallback]}>
              <MaterialCommunityIcons name="music-note" size={48} color={colors.secondary} />
            </View>
          )}
        </View>
        <Text style={styles.label}>{t('radio.nowPlaying')}</Text>
        <Text style={styles.songTitle} numberOfLines={2}>
          {nowPlaying.song.title}
        </Text>
        <Text style={styles.songArtist} numberOfLines={1}>
          {nowPlaying.song.artist}
        </Text>
      </View>
    );
  }

  // Show radio name and tagline when no music info available
  return (
    <>
      <Text style={styles.radioName}>{radioName}</Text>
      <Text style={styles.tagline}>{radioTagline}</Text>
    </>
  );
});
