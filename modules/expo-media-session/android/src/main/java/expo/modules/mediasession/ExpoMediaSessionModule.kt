package expo.modules.mediasession

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo Module that provides:
 * 1. WiFi lock — prevents Android from killing WiFi with screen off
 * 2. Notification artwork override — replaces the artwork bitmap on
 *    expo-audio's media notification directly, bypassing the native
 *    loadArtworkFromUrl which has a URL.equals() bug for file:// URIs.
 *
 * The notification itself (foreground service, title, artist, controls)
 * is managed by expo-audio's AudioControlsService via setActiveForLockScreen.
 * We ONLY override the artwork bitmap after expo-audio posts it.
 */
class ExpoMediaSessionModule : Module() {

  private var wifiLock: WifiManager.WifiLock? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("ExpoMediaSession")

    Events("onRemotePlay", "onRemotePause", "onRemoteStop")

    // Start WiFi lock
    Function("activate") { _: String, _: String, _: String ->
      acquireWifiLock()
    }

    // No-op (notification handled by expo-audio)
    Function("updateMetadata") { _: String, _: String, _: String -> }

    // No-op
    Function("updatePlaybackState") { _: Boolean -> }

    // Release WiFi lock
    Function("deactivate") {
      releaseWifiLock()
    }

    /**
     * Override the artwork on expo-audio's media notification.
     * Finds the notification on channel "expo_audio_channel", loads the
     * bitmap from the given file:// URI, and re-posts the notification
     * with the new large icon. Runs with a 200ms delay to ensure
     * expo-audio's synchronous notification rebuild has completed.
     */
    Function("overrideNotificationArtwork") { artworkUri: String ->
      val ctx = appContext.reactContext ?: return@Function
      mainHandler.postDelayed({
        overrideArtwork(ctx, artworkUri)
      }, 200)
    }

    OnDestroy {
      releaseWifiLock()
      mainHandler.removeCallbacksAndMessages(null)
    }
  }

  private fun overrideArtwork(ctx: Context, artworkUri: String) {
    try {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        ?: return

      // Find expo-audio's notification by channel ID
      val audioNotification = nm.activeNotifications.find {
        it.notification.channelId == "expo_audio_channel"
      } ?: return

      // Load bitmap from local file
      val path = artworkUri.removePrefix("file://")
      val rawBitmap = BitmapFactory.decodeFile(path) ?: return

      // Scale down to avoid TransactionTooLargeException
      val bitmap = if (rawBitmap.width > 512 || rawBitmap.height > 512) {
        val scale = 512.0f / maxOf(rawBitmap.width, rawBitmap.height)
        val scaled = Bitmap.createScaledBitmap(
          rawBitmap,
          (rawBitmap.width * scale).toInt(),
          (rawBitmap.height * scale).toInt(),
          true
        )
        if (scaled !== rawBitmap) rawBitmap.recycle()
        scaled
      } else {
        rawBitmap
      }

      // Recover the notification builder and replace the large icon
      val builder = Notification.Builder.recoverBuilder(ctx, audioNotification.notification)
        .setLargeIcon(bitmap)

      // Re-post with the same ID — overrides expo-audio's notification
      nm.notify(audioNotification.id, builder.build())
    } catch (_: Exception) {
      // Best effort — if anything fails, expo-audio's notification stays as-is
    }
  }

  @Suppress("DEPRECATION")
  private fun acquireWifiLock() {
    if (wifiLock?.isHeld == true) return
    try {
      val ctx = appContext.reactContext ?: return
      val wifiManager = ctx.applicationContext
        .getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return
      wifiLock = wifiManager.createWifiLock(
        WifiManager.WIFI_MODE_FULL_HIGH_PERF,
        "olhaqueduas:radio-stream"
      ).apply {
        setReferenceCounted(false)
        acquire()
      }
    } catch (_: Exception) {
      // Best effort
    }
  }

  private fun releaseWifiLock() {
    try {
      wifiLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {}
    wifiLock = null
  }
}
