package expo.modules.mediasession

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import java.net.URL

/**
 * Foreground service that owns the entire media session and notification.
 *
 * Replaces the previous architecture where expo-audio managed the notification
 * and our module patched its artwork. Now we have full, race-free control over:
 *   - MediaSession (lock screen controls, media buttons, Bluetooth)
 *   - Notification (artwork, title, artist, transport actions)
 *   - WiFi lock (prevents WiFi off with screen off during streaming)
 *
 * expo-audio is still used for audio streaming (ExoPlayer), but it no longer
 * manages any notification or MediaSession — setActiveForLockScreen is never
 * called.
 */
class MediaService : Service() {

  companion object {
    const val CHANNEL_ID = "olhaqueduas_radio"
    const val NOTIFICATION_ID = 1001

    const val ACTION_ACTIVATE = "expo.modules.mediasession.ACTIVATE"
    const val ACTION_PLAY = "expo.modules.mediasession.PLAY"
    const val ACTION_PAUSE = "expo.modules.mediasession.PAUSE"
    const val ACTION_STOP = "expo.modules.mediasession.STOP"

    @Volatile
    var instance: MediaService? = null
      private set

    /** Callback into ExpoMediaSessionModule to emit JS events. */
    var transportCallback: ((String) -> Unit)? = null

    /** One-shot callback fired after ACTION_ACTIVATE completes. Used by the
     *  module to flush pending updateMetadata/updatePlaybackState calls that
     *  arrived before the service was ready. */
    var onReadyCallback: (() -> Unit)? = null
  }

  private var mediaSession: MediaSession? = null
  private var wifiLock: WifiManager.WifiLock? = null

  private var currentTitle = ""
  private var currentArtist = ""
  private var currentBitmap: Bitmap? = null
  private var cachedArtworkUri = ""
  private var isPlaying = false

  // Background thread for bitmap decoding — keeps main thread free.
  private val artworkThread = HandlerThread("media-artwork").apply { start() }
  private val artworkHandler = Handler(artworkThread.looper)

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    createNotificationChannel()
    initMediaSession()
    acquireWifiLock()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_ACTIVATE -> {
        // Initial start or re-activate: apply metadata from intent, go foreground.
        currentTitle = intent.getStringExtra("title") ?: currentTitle
        currentArtist = intent.getStringExtra("artist") ?: currentArtist
        val artworkUri = intent.getStringExtra("artworkUri") ?: ""

        updateSessionMetadata()
        goForeground()

        // Load artwork on background thread, update notification when ready.
        if (artworkUri.isNotEmpty() && artworkUri != cachedArtworkUri) {
          val uriCopy = artworkUri
          artworkHandler.post {
            val bitmap = loadBitmap(uriCopy)
            if (bitmap != null) {
              currentBitmap = bitmap
              cachedArtworkUri = uriCopy
              updateSessionMetadata()
              postNotification()
            }
          }
        }

        // Flush any pending updates that the module queued before we were ready.
        onReadyCallback?.invoke()
        onReadyCallback = null
      }

      ACTION_PLAY -> transportCallback?.invoke("onRemotePlay")
      ACTION_PAUSE -> transportCallback?.invoke("onRemotePause")
      ACTION_STOP -> transportCallback?.invoke("onRemoteStop")
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    instance = null
    releaseWifiLock()
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
    artworkHandler.removeCallbacksAndMessages(null)
    artworkThread.quitSafely()
    cachedArtworkUri = ""
    // Don't recycle bitmap — Android may still reference it in the
    // notification system. Let GC collect it.
    currentBitmap = null
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // App swiped from recents — stop everything.
    transportCallback?.invoke("onRemoteStop")
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  // =========================================================================
  // Public API — called from ExpoMediaSessionModule
  // =========================================================================

  fun updateMetadata(title: String, artist: String, artworkUri: String?) {
    currentTitle = title
    currentArtist = artist

    if (!artworkUri.isNullOrEmpty() && artworkUri != cachedArtworkUri) {
      val uriCopy = artworkUri
      artworkHandler.post {
        val bitmap = loadBitmap(uriCopy)
        if (bitmap != null) {
          currentBitmap = bitmap
          cachedArtworkUri = uriCopy
        }
        updateSessionMetadata()
        postNotification()
      }
    } else {
      updateSessionMetadata()
      postNotification()
    }
  }

  fun updatePlaybackState(playing: Boolean) {
    isPlaying = playing

    val state = PlaybackState.Builder()
      .setActions(
        PlaybackState.ACTION_PLAY or
        PlaybackState.ACTION_PAUSE or
        PlaybackState.ACTION_STOP or
        PlaybackState.ACTION_PLAY_PAUSE
      )
      .setState(
        if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
        PlaybackState.PLAYBACK_POSITION_UNKNOWN,
        if (playing) 1.0f else 0f
      )
      .build()

    mediaSession?.setPlaybackState(state)
    postNotification()
  }

  // =========================================================================
  // Notification channel + MediaSession init
  // =========================================================================

  private fun createNotificationChannel() {
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Rádio Olha que Duas",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Controles de reprodução da rádio"
      setShowBadge(false)
    }
    val nm = getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(channel)
  }

  private fun initMediaSession() {
    mediaSession = MediaSession(this, "OlhaQueduasRadio").apply {
      setCallback(object : MediaSession.Callback() {
        override fun onPlay() { transportCallback?.invoke("onRemotePlay") }
        override fun onPause() { transportCallback?.invoke("onRemotePause") }
        override fun onStop() { transportCallback?.invoke("onRemoteStop") }
      })
      isActive = true
    }
    // Set initial paused state with available actions.
    updatePlaybackState(false)
  }

  // =========================================================================
  // Notification
  // =========================================================================

  private fun goForeground() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID, notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun postNotification() {
    try {
      val nm = getSystemService(NotificationManager::class.java)
      nm.notify(NOTIFICATION_ID, buildNotification())
    } catch (_: Exception) {
      // Best effort — POST_NOTIFICATIONS may not be granted on Android 13+.
    }
  }

  private fun buildNotification(): Notification {
    val sessionToken = mediaSession?.sessionToken

    // Tap notification → open app
    val contentIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(
        this, 0, it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    // Swipe notification away (only when paused, since ongoing=true blocks swipe)
    val deleteIntent = actionPendingIntent(ACTION_STOP, 2)

    val builder = Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(getSmallIconRes())
      .setContentTitle(currentTitle)
      .setContentText(currentArtist)
      .setOngoing(isPlaying)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setDeleteIntent(deleteIntent)
      .setStyle(
        Notification.MediaStyle()
          .setMediaSession(sessionToken)
          .setShowActionsInCompactView(0, 1)
      )

    contentIntent?.let { builder.setContentIntent(it) }
    currentBitmap?.let { if (!it.isRecycled) builder.setLargeIcon(it) }

    // Action 0: Play / Pause toggle
    if (isPlaying) {
      @Suppress("DEPRECATION")
      builder.addAction(
        Notification.Action.Builder(
          android.R.drawable.ic_media_pause,
          "Pausa",
          actionPendingIntent(ACTION_PAUSE, 0)
        ).build()
      )
    } else {
      @Suppress("DEPRECATION")
      builder.addAction(
        Notification.Action.Builder(
          android.R.drawable.ic_media_play,
          "Play",
          actionPendingIntent(ACTION_PLAY, 0)
        ).build()
      )
    }

    // Action 1: Stop
    @Suppress("DEPRECATION")
    builder.addAction(
      Notification.Action.Builder(
        android.R.drawable.ic_menu_close_clear_cancel,
        "Parar",
        actionPendingIntent(ACTION_STOP, 1)
      ).build()
    )

    return builder.build()
  }

  private fun actionPendingIntent(action: String, requestCode: Int): PendingIntent {
    return PendingIntent.getService(
      this, requestCode,
      Intent(this, MediaService::class.java).setAction(action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /**
   * Try to use the notification icon generated by expo-notifications
   * (monochrome, correct for notification bar). Fall back to app icon.
   */
  private fun getSmallIconRes(): Int {
    val notifIcon = resources.getIdentifier("notification_icon", "drawable", packageName)
    if (notifIcon != 0) return notifIcon
    return applicationInfo.icon
  }

  // =========================================================================
  // Bitmap loading — scale to 512x512, ensure opaque
  // =========================================================================

  private fun loadBitmap(artworkUri: String): Bitmap? {
    val rawBitmap = if (artworkUri.startsWith("http://") || artworkUri.startsWith("https://")) {
      // Remote URL — download on this background thread.
      try {
        val connection = URL(artworkUri).openConnection()
        connection.connectTimeout = 8000
        connection.readTimeout = 8000
        BitmapFactory.decodeStream(connection.getInputStream())
      } catch (_: Exception) {
        null
      }
    } else {
      // Local file:// URI or plain path.
      val path = artworkUri.removePrefix("file://")
      BitmapFactory.decodeFile(path)
    } ?: return null

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

    return ensureOpaque(scaled)
  }

  /**
   * Draw onto a solid black background if the bitmap has alpha.
   * Prevents Android 13 notification artwork transparency overlap
   * (Google Issue Tracker #243778594).
   */
  private fun ensureOpaque(source: Bitmap): Bitmap {
    if (!source.hasAlpha()) return source
    val opaque = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(opaque)
    canvas.drawColor(Color.BLACK)
    canvas.drawBitmap(source, 0f, 0f, null)
    return opaque
  }

  // =========================================================================
  // MediaSession metadata
  // =========================================================================

  private fun updateSessionMetadata() {
    val builder = MediaMetadata.Builder()
      .putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
      .putString(MediaMetadata.METADATA_KEY_ARTIST, currentArtist)

    currentBitmap?.let { bmp ->
      if (!bmp.isRecycled) {
        builder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, bmp)
      }
    }

    mediaSession?.setMetadata(builder.build())
  }

  // =========================================================================
  // WiFi lock — prevents Android from disabling WiFi with screen off
  // =========================================================================

  @Suppress("DEPRECATION")
  private fun acquireWifiLock() {
    try {
      val wm = applicationContext
        .getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return
      wifiLock = wm.createWifiLock(
        WifiManager.WIFI_MODE_FULL_HIGH_PERF,
        "olhaqueduas:radio-stream"
      ).apply {
        setReferenceCounted(false)
        acquire()
      }
    } catch (_: Exception) {
      // Best effort — some devices may restrict WifiLock.
    }
  }

  private fun releaseWifiLock() {
    try {
      wifiLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {}
    wifiLock = null
  }
}
