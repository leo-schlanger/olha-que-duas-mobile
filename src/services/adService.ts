import mobileAds, { MaxAdContentRating, BannerAdSize } from 'react-native-google-mobile-ads';
import { Platform } from 'react-native';

// Google AdMob test IDs (use in development)
// In production, replace with real IDs from AdMob Console
const TEST_AD_UNITS = {
  BANNER: Platform.select({
    ios: 'ca-app-pub-3940256099942544/2934735716',
    android: 'ca-app-pub-3940256099942544/6300978111',
  }) as string,
  INTERSTITIAL: Platform.select({
    ios: 'ca-app-pub-3940256099942544/4411468910',
    android: 'ca-app-pub-3940256099942544/1033173712',
  }) as string,
};

// Production IDs - Olha que Duas AdMob
const PRODUCTION_AD_UNITS = {
  BANNER: Platform.select({
    ios: 'ca-app-pub-7365386697613870/8868122415', // TODO: Create iOS ad unit when needed
    android: 'ca-app-pub-7365386697613870/8868122415',
  }) as string,
  INTERSTITIAL: Platform.select({
    ios: 'ca-app-pub-7365386697613870/8868122415', // TODO: Create interstitial ad unit
    android: 'ca-app-pub-7365386697613870/8868122415', // TODO: Create interstitial ad unit
  }) as string,
};

// Use test IDs in development
const IS_DEVELOPMENT = __DEV__;

class AdService {
  private isInitialized = false;

  /**
   * Initialize the Google Mobile Ads SDK
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Configure the SDK
      await mobileAds().setRequestConfiguration({
        // Set maximum ad content rating
        maxAdContentRating: MaxAdContentRating.PG,
        // Set child-directed treatment (GDPR)
        tagForChildDirectedTreatment: false,
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
   */
  getBannerAdUnitId(): string {
    return IS_DEVELOPMENT ? TEST_AD_UNITS.BANNER : PRODUCTION_AD_UNITS.BANNER;
  }

  /**
   * Get the interstitial ad unit ID
   */
  getInterstitialAdUnitId(): string {
    return IS_DEVELOPMENT ? TEST_AD_UNITS.INTERSTITIAL : PRODUCTION_AD_UNITS.INTERSTITIAL;
  }

  /**
   * Get available banner sizes
   */
  getBannerSizes() {
    return {
      BANNER: BannerAdSize.BANNER, // 320x50
      LARGE_BANNER: BannerAdSize.LARGE_BANNER, // 320x100
      MEDIUM_RECTANGLE: BannerAdSize.MEDIUM_RECTANGLE, // 300x250
      FULL_BANNER: BannerAdSize.FULL_BANNER, // 468x60
      LEADERBOARD: BannerAdSize.LEADERBOARD, // 728x90
      ANCHORED_ADAPTIVE_BANNER: BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
    };
  }
}

export const adService = new AdService();
