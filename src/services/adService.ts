/**
 * Ad Service - Google AdMob Integration
 *
 * Handles ad initialization and configuration with GDPR consent support
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
  private initializationPromise: Promise<void> | null = null;
  private personalizedAds = false;

  /**
   * Initialize the Google Mobile Ads SDK
   * @param personalizedAds - Whether user consented to personalized ads
   */
  async initialize(personalizedAds: boolean = false): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.personalizedAds = personalizedAds;

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      // Configure the SDK with GDPR consent
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
      console.log('AdService: SDK initialized successfully (personalized:', this.personalizedAds, ')');
    } catch (error) {
      console.error('AdService: Initialization error:', error);
      // Reset promise so it can be retried
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Wait for SDK to be ready
   */
  async waitForInitialization(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    if (this.initializationPromise) {
      try {
        await this.initializationPromise;
        return true;
      } catch {
        return false;
      }
    }

    return false;
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

  /**
   * Get whether personalized ads are enabled
   */
  isPersonalizedAdsEnabled(): boolean {
    return this.personalizedAds;
  }
}

export const adService = new AdService();
