/**
 * Expo Config Plugin for react-native-track-player
 * Adds the MusicService to AndroidManifest.xml for proper background audio playback.
 *
 * This is required because react-native-track-player doesn't have an Expo plugin,
 * and the manifest merger doesn't automatically include the service during prebuild.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

function addTrackPlayerService(androidManifest) {
  const { manifest } = androidManifest;

  if (!manifest.application) {
    console.warn('withTrackPlayerService: No application found in AndroidManifest');
    return androidManifest;
  }

  const application = manifest.application[0];

  // Initialize service array if it doesn't exist
  if (!application.service) {
    application.service = [];
  }

  // Check if MusicService already exists
  const musicServiceExists = application.service.some(
    (service) => service.$?.['android:name'] === 'com.doublesymmetry.trackplayer.service.MusicService'
  );

  if (!musicServiceExists) {
    // Add MusicService for background audio playback
    // This matches the exact configuration from react-native-track-player's AndroidManifest.xml
    application.service.push({
      $: {
        'android:name': 'com.doublesymmetry.trackplayer.service.MusicService',
        'android:enabled': 'true',
        'android:exported': 'true',
        'android:foregroundServiceType': 'mediaPlayback',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.MEDIA_BUTTON' } }],
        },
      ],
    });
    console.log('withTrackPlayerService: Added MusicService to AndroidManifest');
  }

  return androidManifest;
}

module.exports = function withTrackPlayerService(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = addTrackPlayerService(config.modResults);
    return config;
  });
};
