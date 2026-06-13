import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import * as ExpoMediaSession from '../../modules/expo-media-session/src';
import { logger } from '../utils/logger';

const ASKED_KEY = '@olhaqueduas:askedBatteryOpt';

/**
 * Prompts the user (once) to exempt the app from battery optimization the
 * first time playback starts. This is the single biggest factor for reliable
 * background metadata/artwork updates and uninterrupted playback in Doze on
 * aggressive OEMs (Xiaomi, Samsung, etc.). No-op on non-Android, once the
 * exemption is granted, and after the user has been asked once.
 */
export function useBatteryOptimizationPrompt(isPlaying: boolean): void {
  const { t } = useTranslation();
  // Only attempt the check once per app session.
  const checkedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!isPlaying || checkedRef.current) return;
    checkedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const asked = await AsyncStorage.getItem(ASKED_KEY);
        if (asked === 'true' || cancelled) return;

        const ignoring = await ExpoMediaSession.isIgnoringBatteryOptimizations();
        if (ignoring || cancelled) return;

        // Persist BEFORE showing so we never nag, even if the dialog is dismissed.
        await AsyncStorage.setItem(ASKED_KEY, 'true');
        if (cancelled) return;

        Alert.alert(t('batteryPrompt.title'), t('batteryPrompt.message'), [
          { text: t('batteryPrompt.later'), style: 'cancel' },
          {
            text: t('batteryPrompt.confirm'),
            onPress: () => {
              try {
                ExpoMediaSession.requestIgnoreBatteryOptimizations();
              } catch (e) {
                logger.error('Battery optimization request failed:', e);
              }
            },
          },
        ]);
      } catch (e) {
        logger.error('Battery optimization prompt failed:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPlaying, t]);
}
