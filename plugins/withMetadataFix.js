const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that fixes expo-audio's AudioControlsService so that
 * the lock-screen notification ALWAYS updates artwork + metadata.
 *
 * ROOT CAUSE: `loadArtworkFromUrl()` compares URLs with
 * `java.net.URL.equals()`, which IGNORES fragments (#...). When the JS
 * side passes the same logo file with a different fragment (cache-busting),
 * the native side sees "same URL", returns without loading the bitmap or
 * invoking the callback → bitmap stays stale, notification not rebuilt.
 *
 * FIX 1 (updateMetadataInternal): Unconditional notification rebuild after
 * updating currentMetadata. Title/artist changes appear immediately.
 *
 * FIX 2 (loadArtworkFromUrl): Remove the `url != currentArtworkUrl` check
 * entirely. Every call loads the artwork and invokes the callback. For
 * file:// URIs (our primary path via artworkCache) this is a <1ms disk
 * read — negligible overhead for correct behavior. Also adds 8s timeouts.
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
      if (content.includes('Always reload artwork')) {
        console.log('withMetadataFix: already patched, skipping');
        return config;
      }

      // ---------------------------------------------------------------
      // FIX 1: updateMetadataInternal — always rebuild notification
      // ---------------------------------------------------------------
      const oldMetadataBlock =
        '    } ?: postOrStartForegroundNotification(startInForeground = false)\n  }\n\n  private fun clearSessionInternal()';
      const newMetadataBlock =
        '    }\n' +
        '    // Always rebuild notification for metadata changes (title, artist)\n' +
        '    // even when artwork URL is unchanged and loadArtworkFromUrl skips.\n' +
        '    postOrStartForegroundNotification(startInForeground = false)\n' +
        '  }\n\n  private fun clearSessionInternal()';

      if (!content.includes(oldMetadataBlock)) {
        // May already be partially patched from a previous version
        console.warn(
          'withMetadataFix: FIX 1 marker not found (may be already applied), skipping'
        );
      } else {
        content = content.replace(oldMetadataBlock, newMetadataBlock);
        console.log('withMetadataFix: FIX 1 applied (always rebuild notification)');
      }

      // ---------------------------------------------------------------
      // FIX 2: loadArtworkFromUrl — remove URL comparison, add timeout
      // ---------------------------------------------------------------
      // Replace the entire method body. We find it by signature and the
      // next method (`hideNotification`) as boundary.

      const methodSig = '  private fun loadArtworkFromUrl(url: URL, callback: (Bitmap?) -> Unit) {';
      const nextMethodSig = '  private fun hideNotification()';

      const methodStart = content.indexOf(methodSig);
      const nextMethodStart = content.indexOf(nextMethodSig);

      if (methodStart === -1 || nextMethodStart === -1) {
        console.warn('withMetadataFix: could not find loadArtworkFromUrl boundaries, skipping FIX 2');
      } else {
        const replacement =
          '  // Always reload artwork — java.net.URL.equals() ignores fragments,\n' +
          '  // causing stale bitmaps when the same logo file is passed with\n' +
          '  // different #timestamp cache-busters. For file:// URIs (our primary\n' +
          '  // path via artworkCache) this is a <1ms disk read per track change.\n' +
          '  private fun loadArtworkFromUrl(url: URL, callback: (Bitmap?) -> Unit) {\n' +
          '    android.util.Log.w("OQD_ARTWORK", "loadArtworkFromUrl called: ${url.toExternalForm()}")\n' +
          '    currentArtworkUrl = url\n' +
          '    artworkLoadJob?.cancel()\n' +
          '\n' +
          '    artworkLoadJob = scope.launch {\n' +
          '      try {\n' +
          '        val connection = url.openConnection()\n' +
          '        connection.connectTimeout = 8000\n' +
          '        connection.readTimeout = 8000\n' +
          '        val inputStream = connection.getInputStream()\n' +
          '        val bitmap = BitmapFactory.decodeStream(inputStream)\n' +
          '        android.util.Log.w("OQD_ARTWORK", "bitmap decoded: ${bitmap != null}, size: ${bitmap?.width}x${bitmap?.height}")\n' +
          '\n' +
          '        if (isActive) {\n' +
          '          android.util.Log.w("OQD_ARTWORK", "callback firing with bitmap=${bitmap != null}")\n' +
          '          callback(bitmap)\n' +
          '        } else {\n' +
          '          android.util.Log.w("OQD_ARTWORK", "coroutine not active, callback SKIPPED")\n' +
          '        }\n' +
          '      } catch (e: Exception) {\n' +
          '        android.util.Log.e("OQD_ARTWORK", "loadArtworkFromUrl FAILED: ${e.message}", e)\n' +
          '        if (isActive) {\n' +
          '          callback(null)\n' +
          '        }\n' +
          '      }\n' +
          '    }\n' +
          '  }\n\n';

        content = content.substring(0, methodStart) + replacement + content.substring(nextMethodStart);
        console.log('withMetadataFix: FIX 2 applied (always load artwork + timeout)');
      }

      // ---------------------------------------------------------------
      // FIX 3: Add diagnostic logging to trace artwork flow
      // ---------------------------------------------------------------

      // Log in setPlayerOptions when metadata arrives
      const setPlayerMetaMarker = 'fun setPlayerMetadata(player: AudioPlayer, metadata: Metadata?) {';
      if (content.includes(setPlayerMetaMarker)) {
        content = content.replace(
          setPlayerMetaMarker,
          setPlayerMetaMarker + '\n    android.util.Log.w("OQD_ARTWORK", "setPlayerMetadata called: title=${metadata?.title}, art=${metadata?.artworkUrl}")'
        );
        console.log('withMetadataFix: FIX 3a applied (setPlayerMetadata logging)');
      }

      // Log in setPlayerOptions
      const setPlayerOptsMarker = 'fun setPlayerOptions(\n    player: AudioPlayer,\n    metadata: Metadata?,\n    options: AudioLockScreenOptions?\n  ) {';
      if (content.includes(setPlayerOptsMarker)) {
        content = content.replace(
          setPlayerOptsMarker,
          setPlayerOptsMarker + '\n    android.util.Log.w("OQD_ARTWORK", "setPlayerOptions called: samePlayer=${player == currentPlayer}, title=${metadata?.title}, art=${metadata?.artworkUrl}")'
        );
        console.log('withMetadataFix: FIX 3b applied (setPlayerOptions logging)');
      }

      // Log in buildNotification to see what bitmap is used
      const buildNotifMarker = '.setLargeIcon(currentArtwork)';
      if (content.includes(buildNotifMarker)) {
        content = content.replace(
          buildNotifMarker,
          '.setLargeIcon(currentArtwork)\n    android.util.Log.w("OQD_ARTWORK", "buildNotification: title=${currentMetadata?.title}, hasArtwork=${currentArtwork != null}, artSize=${currentArtwork?.width}x${currentArtwork?.height}")'
        );
        console.log('withMetadataFix: FIX 3c applied (buildNotification logging)');
      }

      fs.writeFileSync(serviceFile, content, 'utf8');
      console.log('withMetadataFix: AudioControlsService.kt patched successfully');

      return config;
    },
  ]);
};

module.exports = withMetadataFix;
