package expo.modules.mediasession

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo Module that bridges JS ↔ [MediaService].
 *
 * API:
 *   activate(title, artist, artworkUri) — start foreground service + notification
 *   updateMetadata(title, artist, artworkUri) — update notification content
 *   updatePlaybackState(isPlaying) — update play/pause state on notification
 *   deactivate() — stop service, remove notification
 *
 * Events emitted to JS:
 *   onRemotePlay  — user pressed Play on notification / lock screen / headset
 *   onRemotePause — user pressed Pause
 *   onRemoteStop  — user pressed Stop or swiped notification
 *
 * Pending queue:
 *   Because startForegroundService is async, calls to updateMetadata /
 *   updatePlaybackState may arrive before the service is ready. These are
 *   queued and flushed via MediaService.onReadyCallback when the service
 *   finishes ACTION_ACTIVATE.
 */
class ExpoMediaSessionModule : Module() {

  // Pending updates queued while the service is starting.
  private var pendingMeta: Triple<String, String, String>? = null
  private var pendingPlaying: Boolean? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoMediaSession")

    Events("onRemotePlay", "onRemotePause", "onRemoteStop")

    /**
     * Start the foreground media service with initial metadata.
     * If the service is already running, updates metadata and re-foregrounds.
     */
    Function("activate") { title: String, artist: String, artworkUri: String ->
      val ctx = appContext.reactContext ?: return@Function

      // Wire up transport callbacks → JS events.
      MediaService.transportCallback = { event ->
        sendEvent(event)
      }

      // Set up a one-shot callback that fires after the service processes
      // ACTION_ACTIVATE, flushing any pending updates that arrived in the
      // gap between startForegroundService and the service being ready.
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

    /**
     * Update notification metadata (title, artist, artwork).
     * Queues the update if the service isn't ready yet.
     */
    Function("updateMetadata") { title: String, artist: String, artworkUri: String ->
      val service = MediaService.instance
      if (service != null) {
        service.updateMetadata(title, artist, artworkUri)
      } else {
        pendingMeta = Triple(title, artist, artworkUri)
      }
    }

    /**
     * Update the playback state shown on the notification and lock screen.
     * Queues the update if the service isn't ready yet.
     */
    Function("updatePlaybackState") { isPlaying: Boolean ->
      val service = MediaService.instance
      if (service != null) {
        service.updatePlaybackState(isPlaying)
      } else {
        pendingPlaying = isPlaying
      }
    }

    /**
     * Stop the foreground service and remove the notification.
     */
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
