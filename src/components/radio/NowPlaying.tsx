/**
 * Now playing display component. Renders one of five mutually-exclusive
 * states from the service: music, live show, podcast, announcement, or idle
 * (radio name + tagline). The classification logic lives in
 * `nowPlayingService` — this component is purely presentational.
 */

import React, { memo, useMemo } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { NowPlayingProps } from './types';
import { createNowPlayingStyles } from './styles/radioStyles';

// Cross-fade duration when the album/podcast/announcement art swaps.
const ART_TRANSITION_MS = 350;

export const NowPlaying = memo(function NowPlaying({
  nowPlaying,
  radioName,
  radioTagline,
  colors,
}: NowPlayingProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createNowPlayingStyles(colors), [colors]);

  // Music — the most common state.
  if (nowPlaying.mode === 'music' && nowPlaying.song) {
    const musicArtUri = nowPlaying.localArtUri || nowPlaying.song.art;
    // recyclingKey uses song identity so expo-image resets its native view
    // only when the actual song changes (guaranteeing the update even after
    // background → foreground). When only the URI changes for the SAME song
    // (remote → cached file://), the key stays stable and expo-image does a
    // smooth in-place swap instead of flashing blank.
    const musicRecyclingKey = `${nowPlaying.song.title}\0${nowPlaying.song.artist}`;
    return (
      <View style={styles.container}>
        <View style={styles.albumArtContainer}>
          {nowPlaying.song.art ? (
            <Image
              source={{ uri: musicArtUri }}
              recyclingKey={musicRecyclingKey}
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

  // Live show — streamer is on air. No artwork from the API in this case;
  // we fall back to a microphone icon so the panel still has visual weight.
  if (nowPlaying.mode === 'liveShow') {
    return (
      <View style={styles.container}>
        <View style={styles.albumArtContainer}>
          <View style={[styles.albumArt, styles.albumArtFallback]}>
            <MaterialCommunityIcons name="microphone" size={48} color={colors.primary} />
          </View>
        </View>
        <Text style={styles.label}>{t('radio.liveShow')}</Text>
        <Text style={styles.songTitle} numberOfLines={2}>
          {nowPlaying.liveShowName || t('radio.liveShowDefault')}
        </Text>
      </View>
    );
  }

  // Podcast — long-form non-music content with its own artwork.
  if (nowPlaying.mode === 'podcast') {
    const podcastArtUri = nowPlaying.localArtUri || nowPlaying.podcastArt;
    return (
      <View style={styles.container}>
        <View style={styles.albumArtContainer}>
          {nowPlaying.podcastArt ? (
            <Image
              source={{ uri: podcastArtUri }}
              recyclingKey={nowPlaying.podcastName}
              style={styles.albumArt}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={ART_TRANSITION_MS}
              priority="high"
            />
          ) : (
            <View style={[styles.albumArt, styles.albumArtFallback]}>
              <MaterialCommunityIcons name="podcast" size={48} color={colors.secondary} />
            </View>
          )}
        </View>
        <Text style={styles.label}>{t('radio.podcast')}</Text>
        <Text style={styles.songTitle} numberOfLines={2}>
          {nowPlaying.podcastName}
        </Text>
      </View>
    );
  }

  // Announcement / sponsored spot / event promo — short content where the
  // artwork itself is the message.
  if (nowPlaying.mode === 'announcement') {
    const announcementArtUri = nowPlaying.localArtUri || nowPlaying.announcementArt;
    return (
      <View style={styles.container}>
        <View style={styles.albumArtContainer}>
          {nowPlaying.announcementArt ? (
            <Image
              source={{ uri: announcementArtUri }}
              recyclingKey={nowPlaying.announcementName}
              style={styles.albumArt}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={ART_TRANSITION_MS}
              priority="high"
            />
          ) : (
            <View style={[styles.albumArt, styles.albumArtFallback]}>
              <MaterialCommunityIcons name="bullhorn" size={48} color={colors.primary} />
            </View>
          )}
        </View>
        <Text style={styles.label}>{t('radio.announcement')}</Text>
        <Text style={styles.songTitle} numberOfLines={2}>
          {nowPlaying.announcementName}
        </Text>
      </View>
    );
  }

  // Idle — show radio identity.
  return (
    <>
      <Text style={styles.radioName}>{radioName}</Text>
      <Text style={styles.tagline}>{radioTagline}</Text>
    </>
  );
});
