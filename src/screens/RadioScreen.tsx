import React, { useCallback } from 'react';
import { View, StyleSheet, StatusBar, BackHandler, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { RadioPlayer } from '../components/RadioPlayer';
import { BannerAd } from '../components/BannerAd';
import { useTheme } from '../context/ThemeContext';
import { radioService } from '../services/radioService';

/**
 * Radio screen with full-screen player
 */
export function RadioScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  // Handle Android back button - only when Radio tab is focused
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;

      const onBackPress = () => {
        Alert.alert(t('radio.exitAppConfirm.title'), t('radio.exitAppConfirm.message'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('radio.exitAppConfirm.button'),
            style: 'destructive',
            onPress: async () => {
              await radioService.stop();
              BackHandler.exitApp();
            },
          },
        ]);
        return true;
      };

      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [t])
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <View style={styles.content}>
        <RadioPlayer />
      </View>
      <BannerAd />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
