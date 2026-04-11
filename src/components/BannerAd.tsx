import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePremium } from '../context/PremiumContext';
import { useTheme } from '../context/ThemeContext';
import { environment } from '../config/environment';
import { logger } from '../utils/logger';

// Type definitions for dynamically loaded ad modules
interface AdServiceType {
  isReady: () => boolean;
  getBannerAdUnitId: () => string;
  isPersonalizedAdsEnabled: () => boolean;
}

type BannerAdComponentType = React.ComponentType<{
  unitId: string;
  size: string;
  requestOptions?: { requestNonPersonalizedAdsOnly: boolean };
  onAdLoaded?: () => void;
  onAdFailedToLoad?: (_error: unknown) => void;
}>;

// Lazy load native ad modules (not available in Expo Go)
let GoogleBannerAd: BannerAdComponentType | null = null;
let BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: string } = {
  ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER',
};
let adService: AdServiceType | null = null;

if (environment.canUseNativeModules) {
  try {
    const adsModule = require('react-native-google-mobile-ads');
    GoogleBannerAd = adsModule.BannerAd;
    BannerAdSize = adsModule.BannerAdSize;
    adService = require('../services/adService').adService;
  } catch (error) {
    logger.log('Ad modules not available', error);
  }
}

interface BannerAdProps {
  size?: string;
}

export function BannerAd({ size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER }: BannerAdProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isPremium } = usePremium();

  // Hooks must run before any early return (Rules of Hooks)
  const [adError, setAdError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const sdkReadyRef = useRef(false);

  useEffect(() => {
    // Skip SDK polling when native modules are unavailable (Expo Go)
    if (!environment.canUseNativeModules || !adService || !GoogleBannerAd) {
      return;
    }

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
      }, 1000);

      // Timeout after 10 seconds
      timeoutId = setTimeout(() => {
        if (checkInterval) clearInterval(checkInterval);
        if (mounted && !sdkReadyRef.current) {
          logger.log('BannerAd: SDK initialization timeout');
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

  // Not available in Expo Go
  if (!environment.canUseNativeModules || !adService || !GoogleBannerAd) {
    return null;
  }

  // Don't show ads for premium users
  if (isPremium) {
    return null;
  }

  // Show loading indicator while SDK initializes
  if (!sdkReady && !adError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
        </View>
      </View>
    );
  }

  // Show placeholder on error
  if (adError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.placeholder,
            { backgroundColor: colors.card, borderTopColor: colors.background },
          ]}
        >
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            {t('ads.advertisement')}
          </Text>
        </View>
      </View>
    );
  }

  const adUnitId = adService.getBannerAdUnitId();
  const nonPersonalizedAds = !adService.isPersonalizedAdsEnabled();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
          logger.log('BannerAd: Ad loaded');
          setIsLoading(false);
        }}
        onAdFailedToLoad={(error: unknown) => {
          logger.log('BannerAd: Failed to load', error);
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
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
  },
  placeholderText: {
    fontSize: 12,
  },
});
