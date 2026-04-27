package expo.modules.mediasession

import android.content.Intent
import android.os.Build
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
 */
class ExpoMediaSessionModule : Module() {

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
     * No-op if the service isn't running yet.
     */
    Function("updateMetadata") { title: String, artist: String, artworkUri: String ->
      MediaService.instance?.updateMetadata(title, artist, artworkUri)
    }

    /**
     * Update the playback state shown on the notification and lock screen.
     */
    Function("updatePlaybackState") { isPlaying: Boolean ->
      MediaService.instance?.updatePlaybackState(isPlaying)
    }

    /**
     * Stop the foreground service and remove the notification.
     */
    Function("deactivate") {
      val service = MediaService.instance
      if (service != null) {
        @Suppress("DEPRECATION")
        service.stopForeground(true)
        service.stopSelf()
      }
      MediaService.transportCallback = null
    }

    OnDestroy {
      MediaService.transportCallback = null
    }
  }
}
