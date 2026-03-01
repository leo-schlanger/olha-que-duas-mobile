/**
 * Ad Service - Google AdMob Integration
 *
 * Handles ad initialization and configuration
 */

import mobileAds, { MaxAdContentRating } from 'react-native-google-mobile-ads';
import { Platform } from 'react-native';

// Google AdMob Ad Unit IDs
const AD_UNITS = {
  BANNER: Platform.select({
    ios: 'ca-app-pub-7365386697613870/8868122415',
    android: 'ca-app-pub-7365386697613870/8868122415',
  }) as string,
};

// Test Ad Unit IDs (for development)
const TEST_AD_UNITS = {
  BANNER: Platform.select({
    ios: 'ca-app-pub-3940256099942544/2934735716',
    android: 'ca-app-pub-3940256099942544/6300978111',
  }) as string,
};

class AdService {
  private isInitialized = false;

  /**
   * Initialize the Google Mobile Ads SDK
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Configure the SDK
      await mobileAds().setRequestConfiguration({
        // Maximum ad content rating
        maxAdContentRating: MaxAdContentRating.PG,
        // Tag for child-directed treatment
        tagForChildDirectedTreatment: false,
        // Tag for users under age of consent
        tagForUnderAgeOfConsent: false,
      });

      // Initialize the SDK
      await mobileAds().initialize();

      this.isInitialized = true;
      console.log('AdService: SDK initialized successfully');
    } catch (error) {
      console.error('AdService: Initialization error:', error);
    }
  }

  /**
   * Get the banner ad unit ID
   * Uses test IDs in development, production IDs in release
   */
  getBannerAdUnitId(): string {
    if (__DEV__) {
      return TEST_AD_UNITS.BANNER;
    }
    return AD_UNITS.BANNER;
  }

  /**
   * Check if ads are initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

export const adService = new AdService();
