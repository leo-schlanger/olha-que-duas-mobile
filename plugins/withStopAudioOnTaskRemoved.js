const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Expo config plugin that adds android:stopWithTask="true" to the
 * expo-audio AudioControlsService in AndroidManifest.xml.
 *
 * This is a safety net — our primary media service (expo-media-session's
 * MediaService) declares stopWithTask in its own manifest. This plugin
 * ensures that if expo-audio's AudioControlsService is ever started
 * (e.g., by a stray setActiveForLockScreen call), it also stops when
 * the user swipes the app away.
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
      // Preserve foregroundServiceType if already set by expo-audio plugin;
      // add it if missing — Android 14+ requires it in the manifest for
      // startForeground() to succeed with FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK.
      if (!existing.$['android:foregroundServiceType']) {
        existing.$['android:foregroundServiceType'] = 'mediaPlayback';
      }
      existing.$['tools:node'] = 'merge';
    } else {
      // Add a merge overlay for the AudioControlsService
      application.service.push({
        $: {
          'android:name': 'expo.modules.audio.service.AudioControlsService',
          'android:foregroundServiceType': 'mediaPlayback',
          'android:exported': 'false',
          'android:stopWithTask': 'true',
          'tools:node': 'merge',
        },
      });
    }

    return config;
  });
};

module.exports = withStopAudioOnTaskRemoved;
