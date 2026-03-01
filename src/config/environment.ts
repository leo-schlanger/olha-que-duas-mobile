import Constants from 'expo-constants';

/**
 * Environment detection for the app
 *
 * - DEV (Expo Go): No native modules, use placeholders
 * - PRODUCTION (EAS Build): Full native modules enabled
 */

// Check if running in Expo Go (no native modules available)
const isExpoGo = Constants.appOwnership === 'expo';

// Check if running in development mode
const isDevelopment = __DEV__;

// Check if running in production build
const isProductionBuild = !isExpoGo && !isDevelopment;

// Native modules only work in standalone builds (not Expo Go)
const canUseNativeModules = !isExpoGo;

export const environment = {
  isExpoGo,
  isDevelopment,
  isProductionBuild,
  canUseNativeModules,

  // Feature flags
  features: {
    ads: canUseNativeModules,        // Ads only in builds
    purchases: canUseNativeModules,  // Purchases only in builds
  },
};

// Debug log in development
if (isDevelopment) {
  console.log('Environment:', {
    isExpoGo,
    isDevelopment,
    canUseNativeModules,
  });
}
