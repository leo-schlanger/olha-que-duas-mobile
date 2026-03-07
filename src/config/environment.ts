import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Environment detection for the app
 *
 * ExecutionEnvironment values:
 * - 'storeClient' = Expo Go
 * - 'standalone' = EAS Build / standalone app
 * - 'bare' = bare workflow
 */

// Check execution environment - this is the reliable way
const executionEnvironment = Constants.executionEnvironment;

// Expo Go uses 'storeClient', native builds use 'standalone' or 'bare'
const isExpoGo = executionEnvironment === ExecutionEnvironment.StoreClient;

// Check if running in development mode
const isDevelopment = __DEV__;

// Native modules work in standalone and bare builds
const canUseNativeModules = !isExpoGo;

export const environment = {
  isExpoGo,
  isDevelopment,
  canUseNativeModules,
  executionEnvironment,

  // Feature flags
  features: {
    ads: canUseNativeModules,
    purchases: canUseNativeModules,
  },
};

// Always log environment for debugging
console.log('Environment:', {
  executionEnvironment,
  isExpoGo,
  canUseNativeModules,
});
