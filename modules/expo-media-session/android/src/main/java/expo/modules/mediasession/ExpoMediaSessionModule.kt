package expo.modules.mediasession

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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

  override fun definition() = ModuleDefinition {
    Name("ExpoMediaSession")

    Events("onRemotePlay", "onRemotePause", "onRemoteStop")

    Function("activate") { title: String, artist: String, artworkUri: String ->
      val ctx = appContext.reactContext ?: return@Function

      // Clear stale callbacks from any previous activation.
      MediaService.onReadyCallback = null

      MediaService.transportCallback = { event ->
        try {
          sendEvent(event)
        } catch (_: Exception) {
          // Module context may be destroyed (e.g., app being killed).
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

    Function("deactivate") {
      pendingMeta = null
      pendingPlaying = null
      MediaService.onReadyCallback = null

      val service = MediaService.instance
      if (service != null) {
        @Suppress("DEPRECATION")
        service.stopForeground(true)
        service.stopSelf()
      }
      MediaService.transportCallback = null
    }

    OnDestroy {
      pendingMeta = null
      pendingPlaying = null
      MediaService.onReadyCallback = null
      MediaService.transportCallback = null
    }
  }
}
