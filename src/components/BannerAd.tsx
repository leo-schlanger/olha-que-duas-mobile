import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { colors } from '../config/site';
import { environment } from '../config/environment';

interface BannerAdProps {
  size?: any;
}

// Lazy load native ad module only when needed
let GoogleBannerAd: any = null;
let BannerAdSize: any = null;

if (environment.canUseNativeModules) {
  try {
    const AdModule = require('react-native-google-mobile-ads');
    GoogleBannerAd = AdModule.BannerAd;
    BannerAdSize = AdModule.BannerAdSize;
  } catch (error) {
    console.log('Native ads module not available');
  }
}

export function BannerAd({ size }: BannerAdProps) {
  // Show placeholder in Expo Go / Development
  if (!environment.features.ads || !GoogleBannerAd) {
    if (environment.isDevelopment) {
      return (
        <View style={styles.container}>
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Ad Banner</Text>
          </View>
        </View>
      );
    }
    return null;
  }

  // Production: Show real ads
  const adUnitId = __DEV__
    ? 'ca-app-pub-3940256099942544/6300978111' // Test ID
    : 'ca-app-pub-7365386697613870/8868122415'; // Production ID

  return (
    <View style={styles.container}>
      <GoogleBannerAd
        unitId={adUnitId}
        size={size || BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdFailedToLoad={(error: any) => {
          console.log('Banner ad failed to load:', error);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  placeholder: {
    height: 50,
    width: '100%',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
