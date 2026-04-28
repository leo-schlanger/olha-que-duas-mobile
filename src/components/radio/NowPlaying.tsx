/**
 * Now playing display component. Renders one of five mutually-exclusive
 * states from the service: music, live show, podcast, announcement, or idle
 * (radio name + tagline). The classification logic lives in
 * `nowPlayingService` — this component is purely presentational.
 */

import React, { memo, useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, AppState } from 'react-native';
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
  const imageRef = useRef<Image>(null);

  // Reset image error state when track changes.
  const artIdentity = nowPlaying.song?.art || nowPlaying.podcastArt || nowPlaying.announcementArt;
  useEffect(() => {
    setImageFailed(false);
  }, [artIdentity]);

  // Counter that increments each time the app returns to foreground.
  // Including it in the Image `key` guarantees that React unmounts/remounts
  // the Image component AFTER the Activity has resumed — so Glide's
  // RequestManager is active and executes the load immediately instead of
  // queueing it (which is what happens when the key changes while the
  // Activity is still paused in the background).
  const [fgCount, setFgCount] = useState(0);
  // Tracks image load failure so we can show a fallback icon instead of a
  // blank space when artwork returns 404 or is corrupted.
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setFgCount((c) => c + 1);
        // Belt-and-suspenders: also force a reload after the new component
        // mounts, in case Glide still served a stale bitmap from cache.
        setTimeout(() => {
          imageRef.current?.reloadAsync();
        }, 200);
      }
    });
    return () => sub.remove();
  }, []);

  // Music — the most common state.
  if (nowPlaying.mode === 'music' && nowPlaying.song) {
    const musicArtUri = nowPlaying.localArtUri || nowPlaying.song.art;
    // key includes song identity + foreground count. The foreground count
    // ensures the Image is remounted when returning from background (where
    // Glide was paused), while song identity handles normal foreground
    // transitions without unnecessary remounts.
    const imageKey = `m\0${musicArtUri}\0${fgCount}`;
    return (
      <View style={styles.container}>
        <View style={styles.albumArtContainer}>
          {nowPlaying.song.art && !imageFailed ? (
            <Image
              ref={imageRef}
              key={imageKey}
              source={{ uri: musicArtUri }}
              style={styles.albumArt}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={ART_TRANSITION_MS}
              priority="high"
              onError={() => setImageFailed(true)}
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
    const imageKey = `p\0${podcastArtUri}\0${fgCount}`;
    return (
      <View style={styles.container}>
        <View style={styles.albumArtContainer}>
          {nowPlaying.podcastArt && !imageFailed ? (
            <Image
              ref={imageRef}
              key={imageKey}
              source={{ uri: podcastArtUri }}
              style={styles.albumArt}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={ART_TRANSITION_MS}
              priority="high"
              onError={() => setImageFailed(true)}
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
    const imageKey = `a\0${announcementArtUri}\0${fgCount}`;
    return (
      <View style={styles.container}>
        <View style={styles.albumArtContainer}>
          {nowPlaying.announcementArt && !imageFailed ? (
            <Image
              ref={imageRef}
              key={imageKey}
              source={{ uri: announcementArtUri }}
              style={styles.albumArt}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={ART_TRANSITION_MS}
              priority="high"
              onError={() => setImageFailed(true)}
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
