const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that patches expo-audio's AudioControlsService to
 * acquire a WifiLock when the foreground media service starts.
 *
 * WHY: Android turns off WiFi when the screen is off to save battery.
 * expo-audio's foreground service holds a CPU WakeLock (via Android's
 * MediaSessionService) but does NOT hold a WifiLock. Without it, the
 * TCP connection to the Icecast stream dies within seconds of screen-off
 * → audio stutters and stops.
 *
 * HOW: At prebuild time, this plugin reads AudioControlsService.kt from
 * node_modules/expo-audio and inserts:
 *   - WifiManager import
 *   - wifiLock field
 *   - acquireWifiLock() / releaseWifiLock() methods
 *   - acquire call in setActivePlayerInternal (when player starts)
 *   - release call in onDestroy (when service dies)
 *
 * This is safe because `npx expo prebuild` regenerates the android/
 * directory every time — the patch is re-applied from node_modules.
 */
const withWifiLock = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const serviceDir = path.join(
        config.modRequest.projectRoot,
        'node_modules',
        'expo-audio',
        'android',
        'src',
        'main',
        'java',
        'expo',
        'modules',
        'audio',
        'service'
      );
      const serviceFile = path.join(serviceDir, 'AudioControlsService.kt');

      if (!fs.existsSync(serviceFile)) {
        console.warn('withWifiLock: AudioControlsService.kt not found, skipping');
        return config;
      }

      let content = fs.readFileSync(serviceFile, 'utf8');

      // Guard: don't patch twice
      if (content.includes('wifiLock')) {
        console.log('withWifiLock: already patched, skipping');
        return config;
      }

      // 1. Add WifiManager import after the last import line
      const lastImport = 'import java.net.URL';
      if (!content.includes(lastImport)) {
        console.warn('withWifiLock: could not find import marker, skipping');
        return config;
      }
      content = content.replace(
        lastImport,
        `${lastImport}\nimport android.net.wifi.WifiManager`
      );

      // 2. Add wifiLock field after artworkLoadJob field
      const fieldMarker = 'private var artworkLoadJob: Job? = null';
      if (!content.includes(fieldMarker)) {
        console.warn('withWifiLock: could not find field marker, skipping');
        return config;
      }
      content = content.replace(
        fieldMarker,
        `${fieldMarker}\n  private var wifiLock: WifiManager.WifiLock? = null`
      );

      // 3. Add acquire/release methods before onDestroy
      const onDestroyMarker = '  override fun onDestroy() {';
      if (!content.includes(onDestroyMarker)) {
        console.warn('withWifiLock: could not find onDestroy marker, skipping');
        return config;
      }
      content = content.replace(
        onDestroyMarker,
        `  private fun acquireWifiLock() {
    try {
      if (wifiLock == null) {
        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        @Suppress("DEPRECATION")
        wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "olhaqueduas:radio")
      }
      if (wifiLock?.isHeld == false) {
        wifiLock?.acquire()
      }
    } catch (e: Exception) {
      // Best effort — some devices may restrict WifiLock
    }
  }

  private fun releaseWifiLock() {
    try {
      if (wifiLock?.isHeld == true) {
        wifiLock?.release()
      }
    } catch (e: Exception) {
      // Ignore
    }
    wifiLock = null
  }

  ${onDestroyMarker}`
      );

      // 4. Add acquireWifiLock() call inside setActivePlayerInternal when player starts
      // Look for the line that starts the foreground notification
      const foregroundStartMarker =
        'postOrStartForegroundNotification(startInForeground = true)';
      if (content.includes(foregroundStartMarker)) {
        content = content.replace(
          foregroundStartMarker,
          `${foregroundStartMarker}\n      acquireWifiLock()`
        );
      }

      // 5. Add releaseWifiLock() in onDestroy, before scope.cancel()
      const scopeCancelMarker = '    scope.cancel()';
      if (content.includes(scopeCancelMarker)) {
        // Only add if not already there (the first replace wouldn't duplicate)
        content = content.replace(
          scopeCancelMarker,
          `    releaseWifiLock()\n${scopeCancelMarker}`
        );
      }

      fs.writeFileSync(serviceFile, content, 'utf8');
      console.log('withWifiLock: AudioControlsService.kt patched successfully');

      return config;
    },
  ]);
};

module.exports = withWifiLock;
