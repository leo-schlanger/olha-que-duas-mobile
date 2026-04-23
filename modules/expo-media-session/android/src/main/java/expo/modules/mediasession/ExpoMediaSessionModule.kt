package expo.modules.mediasession

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.IBinder
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoMediaSessionModule : Module() {

  private var service: MediaPlaybackService? = null
  private var bound = false

  private val connection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
      val localBinder = binder as? MediaPlaybackService.LocalBinder ?: return
      service = localBinder.getService()
      bound = true

      // Wire native callbacks to JS events
      service?.onRemotePlay = { sendEvent("onRemotePlay", emptyMap<String, Any>()) }
      service?.onRemotePause = { sendEvent("onRemotePause", emptyMap<String, Any>()) }
      service?.onRemoteStop = { sendEvent("onRemoteStop", emptyMap<String, Any>()) }
    }

    override fun onServiceDisconnected(name: ComponentName?) {
      service = null
      bound = false
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoMediaSession")

    Events("onRemotePlay", "onRemotePause", "onRemoteStop")

    // Start the foreground service and bind to it.
    // title/artist/artworkUri are the initial metadata shown on the notification.
    Function("activate") { title: String, artist: String, artworkUri: String ->
      val ctx = context
      val intent = Intent(ctx, MediaPlaybackService::class.java).apply {
        action = MediaPlaybackService.ACTION_ACTIVATE
        putExtra("title", title)
        putExtra("artist", artist)
        putExtra("artworkUri", artworkUri)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(intent)
      } else {
        ctx.startService(intent)
      }
      // Bind so we can call methods directly (faster than Intent for updates)
      ctx.bindService(
        Intent(ctx, MediaPlaybackService::class.java),
        connection,
        Context.BIND_AUTO_CREATE
      )
    }

    // Update the notification metadata (title, artist, artwork).
    // artworkUri must be a file:// URI pointing to a local image.
    Function("updateMetadata") { title: String, artist: String, artworkUri: String ->
      service?.updateMetadata(title, artist, artworkUri)
    }

    // Update the playback state shown on the notification (play/pause icon).
    Function("updatePlaybackState") { isPlaying: Boolean ->
      service?.updatePlaybackState(isPlaying)
    }

    // Stop the foreground service and release MediaSession.
    Function("deactivate") {
      val ctx = context
      if (bound) {
        try { ctx.unbindService(connection) } catch (_: Exception) {}
        bound = false
        service = null
      }
      ctx.stopService(Intent(ctx, MediaPlaybackService::class.java))
    }

    OnDestroy {
      val ctx = try { context } catch (_: Exception) { null }
      if (bound && ctx != null) {
        try { ctx.unbindService(connection) } catch (_: Exception) {}
        bound = false
      }
      service?.onRemotePlay = null
      service?.onRemotePause = null
      service?.onRemoteStop = null
      service = null
    }
  }

  private val context: Context
    get() = appContext.reactContext
      ?: throw IllegalStateException("React context not available")
}
