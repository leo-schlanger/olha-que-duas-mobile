import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';
import { Platform, LogBox } from 'react-native';

import App from './App';

// Ignore specific warnings that don't affect functionality
LogBox.ignoreLogs([
  'Remote debugger',
  'Require cycle',
]);

/**
 * Register the playback service for background audio support.
 * This MUST happen before the app is registered for background audio to work.
 *
 * The PlaybackService handles:
 * - Lock screen controls
 * - Notification controls (Android)
 * - Headphone/Bluetooth controls
 * - Audio focus management
 */
function registerPlaybackService() {
  // Only register in native builds (not in Expo Go)
  const isExpoGo = Constants.appOwnership === 'expo';

  if (isExpoGo) {
    console.log('[Index] Running in Expo Go - PlaybackService not available');
    return;
  }

  try {
    const TrackPlayer = require('react-native-track-player').default;
    const { PlaybackService } = require('./src/services/playbackService');

    // Register the service
    TrackPlayer.registerPlaybackService(() => PlaybackService);

    console.log(`[Index] PlaybackService registered successfully for ${Platform.OS}`);
  } catch (error) {
    console.error('[Index] Failed to register PlaybackService:', error);
  }
}

// Register playback service BEFORE app registration
registerPlaybackService();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
