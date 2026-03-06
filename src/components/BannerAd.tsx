import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { usePremium } from '../context/PremiumContext';
import { environment } from '../config/environment';
import { colors } from '../config/site';

// Lazy load native ad modules (not available in Expo Go)
let GoogleBannerAd: any = null;
let BannerAdSize: any = { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' };
let adService: any = null;

if (environment.canUseNativeModules) {
  try {
    const adsModule = require('react-native-google-mobile-ads');
    GoogleBannerAd = adsModule.BannerAd;
    BannerAdSize = adsModule.BannerAdSize;
    adService = require('../services/adService').adService;
  } catch (error) {
    console.log('Ad modules not available');
  }
}

interface BannerAdProps {
  size?: string;
}

export function BannerAd({ size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER }: BannerAdProps) {
  // Not available in Expo Go
  if (!environment.canUseNativeModules || !adService || !GoogleBannerAd) {
    return null;
  }
  const { isPremium } = usePremium();
  const [adError, setAdError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const sdkReadyRef = useRef(false);

  useEffect(() => {
    // Wait for SDK to be initialized (done in App.tsx after GDPR consent)
    let mounted = true;
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function checkSdkReady() {
      // Check periodically if SDK is ready
      checkInterval = setInterval(() => {
        if (adService?.isReady()) {
          if (checkInterval) clearInterval(checkInterval);
          if (timeoutId) clearTimeout(timeoutId);
          if (mounted) {
            sdkReadyRef.current = true;
            setSdkReady(true);
          }
        }
      }, 100);

      // Timeout after 10 seconds
      timeoutId = setTimeout(() => {
        if (checkInterval) clearInterval(checkInterval);
        if (mounted && !sdkReadyRef.current) {
          console.log('BannerAd: SDK initialization timeout');
          setAdError(true);
          setIsLoading(false);
        }
      }, 10000);
    }

    // If already ready, set immediately
    if (adService?.isReady()) {
      sdkReadyRef.current = true;
      setSdkReady(true);
    } else {
      checkSdkReady();
    }

    return () => {
      mounted = false;
      if (checkInterval) clearInterval(checkInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Don't show ads for premium users
  if (isPremium) {
    return null;
  }

  // Show loading indicator while SDK initializes
  if (!sdkReady && !adError) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
        </View>
      </View>
    );
  }

  // Show placeholder on error
  if (adError) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Publicidade</Text>
        </View>
      </View>
    );
  }

  const adUnitId = adService.getBannerAdUnitId();
  const nonPersonalizedAds = !adService.isPersonalizedAdsEnabled();

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
        </View>
      )}
      <GoogleBannerAd
        unitId={adUnitId}
        size={size}
        requestOptions={{
          requestNonPersonalizedAdsOnly: nonPersonalizedAds,
        }}
        onAdLoaded={() => {
          console.log('BannerAd: Ad loaded');
          setIsLoading(false);
        }}
        onAdFailedToLoad={(error: unknown) => {
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
    minHeight: 50,
  },
  loadingContainer: {
    height: 50,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
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
