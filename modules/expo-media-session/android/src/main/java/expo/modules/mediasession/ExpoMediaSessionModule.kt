package expo.modules.mediasession

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.media3.common.Metadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.extractor.metadata.icy.IcyInfo
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.sharedobjects.SharedRef

/**
 * Expo Module that bridges JS ↔ [MediaService].
 *
 * Pending queue:
 *   Because startForegroundService is async, calls to updateMetadata /
 *   updatePlaybackState may arrive before the service is ready. These are
 *   queued and flushed via MediaService.onReadyCallback when the service
 *   finishes ACTION_ACTIVATE (after artwork loads or fails).
 */
class ExpoMediaSessionModule : Module() {

  private var pendingMeta: Triple<String, String, String>? = null
  private var pendingPlaying: Boolean? = null

  // Listener on expo-audio's ExoPlayer. ICY in-band metadata: ExoPlayer decodes the StreamTitle embedded in the
  // Icecast stream and delivers it through onMetadata at the moment that
  // audio is actually played — the same sync signal the website uses.
  private var attachedPlayer: Player? = null
  private var lastStreamTitle: String? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private val icyListener = object : Player.Listener {
    // expo-audio's AudioPlayer doesn't report player errors to JS (the player
    // just goes idle), so a dropped connection looked like a user pause.
    override fun onPlayerError(error: PlaybackException) {
      Log.w("ExpoMediaSession", "Stream error: ${error.errorCodeName}")
      try {
        sendEvent("onStreamError", mapOf("code" to error.errorCodeName))
      } catch (e: Exception) {
        Log.w("ExpoMediaSession", "Failed to send onStreamError: ${e.message}")
      }
    }

    override fun onMetadata(metadata: Metadata) {
      for (i in 0 until metadata.length()) {
        val entry = metadata.get(i)
        if (entry is IcyInfo) {
          val title = entry.title?.trim().orEmpty()
          if (title.isEmpty() || title == lastStreamTitle) continue
          lastStreamTitle = title
          Log.i("ExpoMediaSession", "ICY StreamTitle: $title")
          // Native side first: the notification must follow the audio even
          // while the JS thread has its timers paused in background.
          MediaService.instance?.onStreamTitle(title)
          try {
            sendEvent("onStreamTitle", mapOf("title" to title))
          } catch (e: Exception) {
            Log.w("ExpoMediaSession", "Failed to send onStreamTitle: ${e.message}")
          }
        }
      }
    }
  }

  private fun detachCurrentPlayer() {
    try {
      attachedPlayer?.removeListener(icyListener)
    } catch (_: Exception) {}
    attachedPlayer = null
    lastStreamTitle = null
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoMediaSession")

    Events("onRemotePlay", "onRemotePause", "onRemoteStop", "onStreamTitle", "onStreamError")

    // Attach to the ExoPlayer behind an expo-audio AudioPlayer (a SharedRef)
    // to receive ICY StreamTitle changes. Any previous player is detached.
    AsyncFunction("attachPlayer") { player: SharedRef<*> ->
      val exo = player.ref as? Player
      if (exo == null) {
        Log.w("ExpoMediaSession", "attachPlayer: not a media3 Player")
        return@AsyncFunction false
      }
      detachCurrentPlayer()
      exo.addListener(icyListener)
      attachedPlayer = exo
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("detachPlayer") {
      detachCurrentPlayer()
    }.runOnQueue(Queues.MAIN)

    // Timer backed by a native Handler. React Native pauses JS timers
    // (setTimeout/setInterval) while the Activity is in background, so
    // reconnect back-off waits must not depend on them.
    AsyncFunction("sleep") { ms: Double, promise: Promise ->
      mainHandler.postDelayed({ promise.resolve(null) }, ms.toLong().coerceAtLeast(0L))
    }

    Function("activate") { title: String, artist: String, artworkUri: String ->
      val ctx = appContext.reactContext ?: return@Function

      // Clear stale callbacks from any previous activation.
      MediaService.onReadyCallback = null

      MediaService.transportCallback = { event ->
        try {
          sendEvent(event)
        } catch (e: Exception) {
          Log.w("ExpoMediaSession", "Failed to send event '$event': ${e.message}")
        }
      }

      // One-shot callback: flushed by the service after ACTION_ACTIVATE
      // completes and artwork is resolved (or fails to load).
      MediaService.onReadyCallback = {
        pendingMeta?.let { (t, a, u) ->
          MediaService.instance?.updateMetadata(t, a, u)
        }
        pendingMeta = null

        pendingPlaying?.let { playing ->
          MediaService.instance?.updatePlaybackState(playing)
        }
        pendingPlaying = null
      }

      val intent = Intent(ctx, MediaService::class.java).apply {
        action = MediaService.ACTION_ACTIVATE
        putExtra("title", title)
        putExtra("artist", artist)
        putExtra("artworkUri", artworkUri)
      }
      ContextCompat.startForegroundService(ctx, intent)
    }

    Function("updateMetadata") { title: String, artist: String, artworkUri: String ->
      val service = MediaService.instance
      if (service != null) {
        service.updateMetadata(title, artist, artworkUri)
      } else {
        pendingMeta = Triple(title, artist, artworkUri)
      }
    }

    Function("updatePlaybackState") { isPlaying: Boolean ->
      val service = MediaService.instance
      if (service != null) {
        service.updatePlaybackState(isPlaying)
      } else {
        pendingPlaying = isPlaying
      }
    }

    Function("startMetadataPolling") { pollingUrl: String ->
      val service = MediaService.instance
      if (service != null) {
        service.startMetadataPolling(pollingUrl)
      } else {
        // Service still starting (startForegroundService is async) — it
        // picks the URL up when it is created.
        MediaService.pendingPollingUrl = pollingUrl
      }
    }

    Function("stopMetadataPolling") {
      MediaService.pendingPollingUrl = null
      MediaService.instance?.stopMetadataPolling()
    }

    // Whether the app is exempt from battery optimization (Doze). Reliable
    // background metadata/artwork updates depend on this on aggressive OEMs.
    AsyncFunction("isIgnoringBatteryOptimizations") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
        ?: return@AsyncFunction false
      pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    // Show the system dialog asking the user to exempt the app from battery
    // optimization. Requires the REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission.
    Function("requestIgnoreBatteryOptimizations") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        try {
          val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${ctx.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          ctx.startActivity(intent)
        } catch (e: Exception) {
          Log.w("ExpoMediaSession", "Battery optimization request failed: ${e.message}")
        }
      }
    }

    Function("deactivate") {
      pendingMeta = null
      pendingPlaying = null
      MediaService.onReadyCallback = null

      val service = MediaService.instance
      if (service != null) {
        service.stopMetadataPolling()
        @Suppress("DEPRECATION")
        service.stopForeground(true)
        service.stopSelf()
      }
      MediaService.transportCallback = null
    }

    OnDestroy {
      mainHandler.post { detachCurrentPlayer() }
      pendingMeta = null
      pendingPlaying = null
      MediaService.onReadyCallback = null
      // DO NOT call stopSelf() here — OnDestroy fires when the Activity is
      // destroyed (e.g., Android reclaiming memory while app is backgrounded).
      // The MediaService foreground service must survive Activity destruction
      // to keep background playback alive. It is only stopped explicitly via
      // deactivate() or when the user swipes the app from recents (onTaskRemoved).
      MediaService.transportCallback = null
    }
  }
}
