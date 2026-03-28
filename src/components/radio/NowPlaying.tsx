/**
 * Now playing display component showing current song or radio info
 */

import React, { memo, useMemo } from 'react';
import { View, Text, Image } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { NowPlayingProps } from './types';
import { createNowPlayingStyles } from './styles/radioStyles';

export const NowPlaying = memo(function NowPlaying({
  nowPlaying,
  radioName,
  radioTagline,
  colors,
}: NowPlayingProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createNowPlayingStyles(colors), [colors]);

  // Show song info if music is playing and not in transition
  if (nowPlaying.isMusic && nowPlaying.song && !nowPlaying.isTransition) {
    return (
      <View style={styles.container}>
        <View style={styles.albumArtContainer}>
          {nowPlaying.song.art ? (
            <Image
              source={{ uri: nowPlaying.song.art }}
              style={styles.albumArt}
              resizeMode="cover"
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
