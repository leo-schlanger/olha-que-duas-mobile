const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Expo config plugin that adds android:stopWithTask="true" to the
 * expo-audio AudioControlsService in AndroidManifest.xml.
 *
 * This ensures that when the user swipes the app away from the recent apps
 * menu, Android automatically stops the foreground media service — preventing
 * the radio notification and audio from lingering after the app is closed.
 *
 * The service is originally declared in expo-audio's library manifest, so we
 * add a matching entry in the app manifest with tools:node="merge" to overlay
 * the stopWithTask attribute during manifest merging.
 */
const withStopAudioOnTaskRemoved = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];
    if (!application) return config;

    if (!application.service) {
      application.service = [];
    }

    // Check if the service entry already exists in the app manifest
    const existing = application.service.find(
      (s) => s.$?.['android:name'] === 'expo.modules.audio.service.AudioControlsService'
    );

    if (existing) {
      existing.$['android:stopWithTask'] = 'true';
      existing.$['tools:node'] = 'merge';
    } else {
      // Add a merge overlay for the AudioControlsService
      application.service.push({
        $: {
          'android:name': 'expo.modules.audio.service.AudioControlsService',
          'android:stopWithTask': 'true',
          'tools:node': 'merge',
        },
      });
    }

    return config;
  });
};

module.exports = withStopAudioOnTaskRemoved;
