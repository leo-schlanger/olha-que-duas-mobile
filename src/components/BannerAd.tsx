import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import {
  BannerAd as GoogleBannerAd,
  BannerAdSize,
  TestIds,
} from 'react-native-google-mobile-ads';
import { usePremium } from '../context/PremiumContext';
import { adService } from '../services/adService';
import { colors } from '../config/site';

interface BannerAdProps {
  size?: BannerAdSize;
}

export function BannerAd({ size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER }: BannerAdProps) {
  const { isPremium } = usePremium();
  const [adError, setAdError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize ad service
    adService.initialize();
  }, []);

  // Don't show ads for premium users
  if (isPremium) {
    return null;
  }

  const adUnitId = adService.getBannerAdUnitId();

  // Show placeholder while loading or on error
  if (adError) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Publicidade</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GoogleBannerAd
        unitId={adUnitId}
        size={size}
        requestOptions={{
          requestNonPersonalizedAdsOnly: false,
        }}
        onAdLoaded={() => {
          console.log('BannerAd: Ad loaded');
          setIsLoading(false);
        }}
        onAdFailedToLoad={(error) => {
          console.log('BannerAd: Failed to load', error);
          setAdError(true);
          setIsLoading(false);
        }}
      />
    </View>
  );
}

// Re-export BannerAdSize for convenience
export { BannerAdSize };

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
