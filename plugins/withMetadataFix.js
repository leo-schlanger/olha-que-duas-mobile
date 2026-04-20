const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that fixes expo-audio's AudioControlsService so that
 * the lock-screen notification ALWAYS rebuilds when metadata changes —
 * even when the artwork URL is the "same".
 *
 * ROOT CAUSE: `updateMetadataInternal()` delegates the notification rebuild
 * to `loadArtworkFromUrl()`'s callback. But `loadArtworkFromUrl()` compares
 * URLs with `java.net.URL.equals()`, which IGNORES the fragment (#...).
 * When the JS side passes the same logo file with a different fragment
 * (cache-busting), the native side sees "same URL" and returns without
 * invoking the callback — so `postOrStartForegroundNotification()` never
 * runs, and the notification stays stuck on the old title/artist/artwork.
 *
 * FIX 1: In `updateMetadataInternal`, ALWAYS call
 * `postOrStartForegroundNotification()` after updating `currentMetadata`,
 * regardless of whether `loadArtworkFromUrl` fires the callback. This
 * guarantees title/artist changes appear immediately. If the artwork IS
 * loading, a second rebuild follows when the download completes.
 *
 * FIX 2: Add connection + read timeouts to `loadArtworkFromUrl`. The
 * original code uses `url.openConnection().getInputStream()` with NO
 * timeout — it can hang indefinitely in background or on bad networks.
 * We add 8-second timeouts matching the JS-side ARTWORK_DOWNLOAD_TIMEOUT.
 */
const withMetadataFix = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const serviceFile = path.join(
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
        'service',
        'AudioControlsService.kt'
      );

      if (!fs.existsSync(serviceFile)) {
        console.warn('withMetadataFix: AudioControlsService.kt not found, skipping');
        return config;
      }

      let content = fs.readFileSync(serviceFile, 'utf8');

      // Guard: don't patch twice
      if (content.includes('Always rebuild notification for metadata changes')) {
        console.log('withMetadataFix: already patched, skipping');
        return config;
      }

      // ---------------------------------------------------------------
      // FIX 1: updateMetadataInternal — always rebuild notification
      // ---------------------------------------------------------------
      // Original code:
      //   currentMetadata?.artworkUrl?.let {
      //     loadArtworkFromUrl(it) { bitmap ->
      //       currentArtwork = bitmap
      //       postOrStartForegroundNotification(startInForeground = false)
      //     }
      //   } ?: postOrStartForegroundNotification(startInForeground = false)
      //
      // We replace the `} ?: postOrStartForegroundNotification(...)` with
      // `}` followed by an unconditional `postOrStartForegroundNotification`.

      const oldMetadataBlock =
        '    } ?: postOrStartForegroundNotification(startInForeground = false)\n  }\n\n  private fun clearSessionInternal()';
      const newMetadataBlock =
        '    }\n' +
        '    // Always rebuild notification for metadata changes (title, artist)\n' +
        '    // even when artwork URL is unchanged and loadArtworkFromUrl skips.\n' +
        '    postOrStartForegroundNotification(startInForeground = false)\n' +
        '  }\n\n  private fun clearSessionInternal()';

      if (!content.includes(oldMetadataBlock)) {
        console.warn(
          'withMetadataFix: could not find updateMetadataInternal marker, skipping FIX 1'
        );
      } else {
        content = content.replace(oldMetadataBlock, newMetadataBlock);
        console.log('withMetadataFix: FIX 1 applied (always rebuild notification)');
      }

      // ---------------------------------------------------------------
      // FIX 2: loadArtworkFromUrl — add connection timeout
      // ---------------------------------------------------------------
      // Original:
      //   val inputStream = url.openConnection().getInputStream()
      //
      // Replace with:
      //   val connection = url.openConnection()
      //   connection.connectTimeout = 8000
      //   connection.readTimeout = 8000
      //   val inputStream = connection.getInputStream()

      const oldConnection = 'val inputStream = url.openConnection().getInputStream()';
      const newConnection =
        'val connection = url.openConnection()\n' +
        '          connection.connectTimeout = 8000\n' +
        '          connection.readTimeout = 8000\n' +
        '          val inputStream = connection.getInputStream()';

      if (!content.includes(oldConnection)) {
        console.warn('withMetadataFix: could not find openConnection marker, skipping FIX 2');
      } else {
        content = content.replace(oldConnection, newConnection);
        console.log('withMetadataFix: FIX 2 applied (artwork download timeout)');
      }

      fs.writeFileSync(serviceFile, content, 'utf8');
      console.log('withMetadataFix: AudioControlsService.kt patched successfully');

      return config;
    },
  ]);
};

module.exports = withMetadataFix;
