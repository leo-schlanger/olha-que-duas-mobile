/**
 * Ad Service - Google AdMob Integration
 *
 * Handles ad initialization and configuration with GDPR consent support
 */

import mobileAds, {
  MaxAdContentRating,
  InterstitialAd,
  AdEventType,
} from 'react-native-google-mobile-ads';
import { logger } from '../utils/logger';
import { Platform } from 'react-native';

// Google AdMob Ad Unit IDs (production)
const AD_UNITS = {
  BANNER: Platform.select({
    ios: 'ca-app-pub-7365386697613870/8868122415',
    android: 'ca-app-pub-7365386697613870/8868122415',
  }) as string,
  MREC: Platform.select({
    ios: 'ca-app-pub-7365386697613870/8073308626',
    android: 'ca-app-pub-7365386697613870/8073308626',
  }) as string,
  INTERSTITIAL: Platform.select({
    ios: 'ca-app-pub-7365386697613870/1117018039',
    android: 'ca-app-pub-7365386697613870/1117018039',
  }) as string,
};

// Test Ad Unit IDs (for development)
const TEST_AD_UNITS = {
  BANNER: Platform.select({
    ios: 'ca-app-pub-3940256099942544/2934735716',
    android: 'ca-app-pub-3940256099942544/6300978111',
  }) as string,
  MREC: Platform.select({
    ios: 'ca-app-pub-3940256099942544/2934735716',
    android: 'ca-app-pub-3940256099942544/6300978111',
  }) as string,
  INTERSTITIAL: Platform.select({
    ios: 'ca-app-pub-3940256099942544/4411468910',
    android: 'ca-app-pub-3940256099942544/1033173712',
  }) as string,
};

class AdService {
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private personalizedAds = false;

  // Interstitial state
  private interstitialAd: InterstitialAd | null = null;
  private isInterstitialLoaded = false;
  private interstitialUnsubscribers: (() => void)[] = [];
  // Retry state for interstitial load failures
  private interstitialRetryCount = 0;
  private interstitialRetryTimeout: ReturnType<typeof setTimeout> | null = null;
  // Backoff schedule: 5s, 30s, 2min, then give up until next manual reload
  private readonly INTERSTITIAL_RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

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
      logger.log(
        'AdService: SDK initialized successfully (personalized:',
        this.personalizedAds,
        ')'
      );
    } catch (error) {
      logger.error('AdService: Initialization error:', error);
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
   * Get the banner ad unit ID (anchored adaptive banner)
   * Uses test IDs in development, production IDs in release
   */
  getBannerAdUnitId(): string {
    if (__DEV__) {
      return TEST_AD_UNITS.BANNER;
    }
    return AD_UNITS.BANNER;
  }

  /**
   * Get the MRec (medium rectangle 300x250) ad unit ID
   * Used by the in-news ad overlay
   */
  getMRectAdUnitId(): string {
    if (__DEV__) {
      return TEST_AD_UNITS.MREC;
    }
    return AD_UNITS.MREC;
  }

  /**
   * Get the interstitial ad unit ID
   */
  getInterstitialAdUnitId(): string {
    if (__DEV__) {
      return TEST_AD_UNITS.INTERSTITIAL;
    }
    return AD_UNITS.INTERSTITIAL;
  }

  /**
   * Pre-load an interstitial ad. Safe to call multiple times — only one
   * instance is kept and it auto-reloads after being shown.
   */
  loadInterstitial(): void {
    if (!this.isInitialized) {
      logger.log('AdService: loadInterstitial called before SDK init, skipping');
      return;
    }

    // Already created — nothing to do (auto-reload handles refresh after show)
    if (this.interstitialAd) {
      return;
    }

    try {
      const adUnitId = this.getInterstitialAdUnitId();
      this.interstitialAd = InterstitialAd.createForAdRequest(adUnitId, {
        requestNonPersonalizedAdsOnly: !this.personalizedAds,
      });

      const loadedUnsub = this.interstitialAd.addAdEventListener(AdEventType.LOADED, () => {
        this.isInterstitialLoaded = true;
        // Reset retry counter on successful load
        this.interstitialRetryCount = 0;
        if (this.interstitialRetryTimeout) {
          clearTimeout(this.interstitialRetryTimeout);
          this.interstitialRetryTimeout = null;
        }
        logger.log('AdService: Interstitial loaded');
      });

      const closedUnsub = this.interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
        logger.log('AdService: Interstitial closed, reloading');
        this.isInterstitialLoaded = false;
        this.interstitialRetryCount = 0;
        // Reload for next time
        this.interstitialAd?.load();
      });

      const errorUnsub = this.interstitialAd.addAdEventListener(AdEventType.ERROR, (error) => {
        this.isInterstitialLoaded = false;
        logger.warn('AdService: Interstitial load error', error);
        // Schedule a retry with exponential backoff. We don't want a single
        // network blip to kill the interstitial slot until the app restarts.
        this.scheduleInterstitialRetry();
      });

      this.interstitialUnsubscribers = [loadedUnsub, closedUnsub, errorUnsub];
      this.interstitialAd.load();
    } catch (error) {
      logger.error('AdService: Failed to create interstitial', error);
      this.interstitialAd = null;
      this.isInterstitialLoaded = false;
    }
  }

  /**
   * Schedule a retry of interstitial.load() with exponential backoff.
   * Gives up silently after the configured delays so we don't pile up timers.
   */
  private scheduleInterstitialRetry(): void {
    if (this.interstitialRetryTimeout) {
      // Already scheduled — don't double up.
      return;
    }
    if (this.interstitialRetryCount >= this.INTERSTITIAL_RETRY_DELAYS_MS.length) {
      logger.log('AdService: Interstitial retry budget exhausted');
      return;
    }
    const delay = this.INTERSTITIAL_RETRY_DELAYS_MS[this.interstitialRetryCount];
    this.interstitialRetryCount++;
    logger.log(
      `AdService: Scheduling interstitial retry #${this.interstitialRetryCount} in ${delay}ms`
    );
    this.interstitialRetryTimeout = setTimeout(() => {
      this.interstitialRetryTimeout = null;
      try {
        this.interstitialAd?.load();
      } catch (error) {
        logger.error('AdService: Retry load() threw', error);
      }
    }, delay);
  }

  /**
   * Try to show the pre-loaded interstitial.
   * Returns true if the ad was shown, false otherwise (caller should fallback).
   */
  showInterstitial(): boolean {
    if (!this.interstitialAd || !this.isInterstitialLoaded) {
      logger.log('AdService: Interstitial not ready');
      return false;
    }

    try {
      this.interstitialAd.show();
      // CLOSED handler will flip isInterstitialLoaded and trigger reload
      this.isInterstitialLoaded = false;
      return true;
    } catch (error) {
      logger.error('AdService: Failed to show interstitial', error);
      return false;
    }
  }

  /**
   * Whether the interstitial is loaded and ready to show
   */
  isInterstitialReady(): boolean {
    return this.isInterstitialLoaded;
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
