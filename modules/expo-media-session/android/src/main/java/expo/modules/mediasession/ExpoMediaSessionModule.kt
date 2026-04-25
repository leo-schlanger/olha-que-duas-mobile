package expo.modules.mediasession

import android.app.NotificationManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo Module that provides:
 * 1. WiFi lock — prevents Android from killing WiFi with screen off
 * 2. Notification artwork override — replaces the artwork bitmap on
 *    expo-audio's media notification directly.
 *
 * The notification itself (foreground service, title, artist, controls)
 * is managed by expo-audio's AudioControlsService via setActiveForLockScreen.
 *
 * Artwork strategy (race-free):
 *   radioService always passes the static radio logo URL to expo-audio's
 *   setActiveForLockScreen. expo-audio caches the logo via URL.equals()
 *   and never starts an async artwork download after the first load.
 *   Track artwork is managed exclusively by this module — we load the
 *   bitmap from a pre-cached file:// URI and re-post the notification
 *   with the correct large icon.
 *
 * The override uses an immediate attempt + 6 retries at increasing delays
 * (up to 5 seconds) on a dedicated HandlerThread. This handles background
 * thread scheduling where the main thread may be deprioritized by Android.
 */
class ExpoMediaSessionModule : Module() {

  private var wifiLock: WifiManager.WifiLock? = null

  // Dedicated background thread for artwork override retries.
  // Using a HandlerThread instead of the main handler ensures our retries
  // fire even when the main thread is deprioritized in background.
  private val artworkThread = HandlerThread("artwork-override").apply { start() }
  private val artworkHandler = Handler(artworkThread.looper)
  private val RETRY_TOKEN = Object()

  // Bitmap cache — avoid re-decoding the same file across retries.
  // We intentionally do NOT recycle old bitmaps — Android 15 crashes with
  // IllegalArgumentException if a recycled bitmap is still referenced by
  // the notification system. Letting the GC collect unreferenced bitmaps
  // is safe and avoids this crash.
  private var cachedBitmap: Bitmap? = null
  private var cachedArtworkUri = ""

  override fun definition() = ModuleDefinition {
    Name("ExpoMediaSession")

    Events("onRemotePlay", "onRemotePause", "onRemoteStop")

    // Start WiFi lock
    Function("activate") { _: String, _: String, _: String ->
      acquireWifiLock()
    }

    // Release WiFi lock
    Function("deactivate") {
      cancelPendingOverrides()
      releaseWifiLock()
    }

    /**
     * Override the artwork on expo-audio's media notification.
     *
     * Loads the bitmap from the given file:// URI, ensures it has an
     * opaque background (Android 13 transparency overlap fix), then
     * performs an immediate override attempt followed by 6 retries at
     * increasing delays on a dedicated thread.
     */
    Function("overrideNotificationArtwork") { artworkUri: String ->
      val ctx = appContext.reactContext ?: return@Function
      cancelPendingOverrides()

      val bitmap = loadBitmap(artworkUri) ?: return@Function

      // Immediate attempt — if the notification is already posted
      // (which it is after the first setActiveForLockScreen call),
      // this succeeds instantly with no visible flash.
      artworkHandler.post { doOverride(ctx, bitmap) }

      // Scheduled retries — handles background scheduling delays
      // where the notification may not be immediately available.
      val now = SystemClock.uptimeMillis()
      for (delay in longArrayOf(300, 700, 1200, 2000, 3500, 5000)) {
        artworkHandler.postAtTime({
          doOverride(ctx, bitmap)
        }, RETRY_TOKEN, now + delay)
      }
    }

    OnDestroy {
      cancelPendingOverrides()
      releaseWifiLock()
      artworkHandler.removeCallbacksAndMessages(null)
      artworkThread.quitSafely()
      // Do NOT recycle bitmaps — the notification system may still
      // reference them. Let GC handle cleanup.
      cachedBitmap = null
    }
  }

  private fun cancelPendingOverrides() {
    artworkHandler.removeCallbacksAndMessages(RETRY_TOKEN)
  }

  /**
   * Load a bitmap from a file:// URI. Caches the result so retries
   * and back-to-back calls with the same URI don't re-decode.
   * Scales to max 512x512 to avoid TransactionTooLargeException.
   * Ensures opaque background to prevent Android 13 transparency
   * overlap where old artwork bleeds through new artwork.
   */
  private fun loadBitmap(artworkUri: String): Bitmap? {
    if (artworkUri == cachedArtworkUri && cachedBitmap != null && !cachedBitmap!!.isRecycled) {
      return cachedBitmap
    }

    val path = artworkUri.removePrefix("file://")
    val rawBitmap = BitmapFactory.decodeFile(path)
      ?: return cachedBitmap  // Keep previous bitmap if new file can't be decoded

    // Scale down to max 512x512
    val scaled = if (rawBitmap.width > 512 || rawBitmap.height > 512) {
      val scale = 512.0f / maxOf(rawBitmap.width, rawBitmap.height)
      val result = Bitmap.createScaledBitmap(
        rawBitmap,
        (rawBitmap.width * scale).toInt(),
        (rawBitmap.height * scale).toInt(),
        true
      )
      if (result !== rawBitmap) rawBitmap.recycle()
      result
    } else {
      rawBitmap
    }

    // Ensure opaque background — Android 13 renders media notification
    // artwork with transparency, causing old artwork to show through.
    val bitmap = ensureOpaque(scaled)

    cachedBitmap = bitmap
    cachedArtworkUri = artworkUri
    return bitmap
  }

  /**
   * If the bitmap has an alpha channel, draw it onto a solid black
   * background. This prevents the Android 13 notification artwork
   * overlap bug (Google Issue Tracker #243778594).
   */
  private fun ensureOpaque(source: Bitmap): Bitmap {
    if (!source.hasAlpha()) return source
    val opaque = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(opaque)
    canvas.drawColor(Color.BLACK)
    canvas.drawBitmap(source, 0f, 0f, null)
    // Don't recycle source here — it may be the same reference
    return opaque
  }

  /**
   * Find expo-audio's notification by channel ID, recover its builder,
   * replace the large icon with our bitmap, and re-post.
   */
  private fun doOverride(ctx: Context, bitmap: Bitmap) {
    if (bitmap.isRecycled) return
    try {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        ?: return

      val audioNotification = nm.activeNotifications.find {
        it.notification.channelId == "expo_audio_channel"
      } ?: return

      @Suppress("DEPRECATION")
      val builder = android.app.Notification.Builder.recoverBuilder(ctx, audioNotification.notification)
        .setLargeIcon(bitmap)

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
