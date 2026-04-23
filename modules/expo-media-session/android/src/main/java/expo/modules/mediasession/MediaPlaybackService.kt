package expo.modules.mediasession

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.wifi.WifiManager
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle

/**
 * Foreground service that manages the media notification and MediaSession.
 *
 * This replaces expo-audio's AudioControlsService for notification/lock-screen
 * management. Artwork is loaded directly from local file:// URIs as a Bitmap,
 * bypassing the java.net.URL.equals() bug in expo-audio's native code.
 *
 * The service also acquires a WiFi lock to prevent Android from killing the
 * WiFi connection when the screen is off (which would drop the ICY stream).
 */
class MediaPlaybackService : Service() {

  companion object {
    const val ACTION_ACTIVATE = "expo.mediasession.ACTIVATE"
    const val ACTION_PLAY = "expo.mediasession.ACTION_PLAY"
    const val ACTION_PAUSE = "expo.mediasession.ACTION_PAUSE"
    const val ACTION_STOP = "expo.mediasession.ACTION_STOP"

    private const val NOTIFICATION_ID = 7744
    private const val CHANNEL_ID = "olhaqueduas-radio"
    private const val SESSION_TAG = "OlhaQueDuasRadio"
  }

  // Callbacks wired by ExpoMediaSessionModule to emit JS events
  var onRemotePlay: (() -> Unit)? = null
  var onRemotePause: (() -> Unit)? = null
  var onRemoteStop: (() -> Unit)? = null

  private var mediaSession: MediaSessionCompat? = null
  private var wifiLock: WifiManager.WifiLock? = null

  private var currentTitle = ""
  private var currentArtist = ""
  private var currentArtworkUri = ""
  private var currentBitmap: Bitmap? = null
  private var isPlaying = true

  // --- Binder for direct method calls from the Module ---

  inner class LocalBinder : Binder() {
    fun getService(): MediaPlaybackService = this@MediaPlaybackService
  }

  private val binder = LocalBinder()

  override fun onBind(intent: Intent?): IBinder = binder

  // --- Lifecycle ---

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    setupMediaSession()
    acquireWifiLock()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_ACTIVATE -> {
        currentTitle = intent.getStringExtra("title") ?: ""
        currentArtist = intent.getStringExtra("artist") ?: ""
        currentArtworkUri = intent.getStringExtra("artworkUri") ?: ""
        currentBitmap = loadBitmap(currentArtworkUri)
        isPlaying = true
        updateMediaSessionMetadata()
        updateMediaSessionPlaybackState()
        startForeground(NOTIFICATION_ID, buildNotification())
      }
      ACTION_PLAY -> {
        isPlaying = true
        onRemotePlay?.invoke()
        updateMediaSessionPlaybackState()
        updateNotification()
      }
      ACTION_PAUSE -> {
        isPlaying = false
        onRemotePause?.invoke()
        updateMediaSessionPlaybackState()
        updateNotification()
      }
      ACTION_STOP -> {
        onRemoteStop?.invoke()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
      }
    }
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // When the user swipes the app from recents, stop everything.
    // This replaces the withStopAudioOnTaskRemoved plugin.
    onRemoteStop?.invoke()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    mediaSession?.apply {
      isActive = false
      release()
    }
    mediaSession = null
    releaseWifiLock()
    currentBitmap?.recycle()
    currentBitmap = null
    onRemotePlay = null
    onRemotePause = null
    onRemoteStop = null
    super.onDestroy()
  }

  // --- Public API (called from Module via Binder) ---

  fun updateMetadata(title: String, artist: String, artworkUri: String) {
    // Skip redundant updates
    if (title == currentTitle && artist == currentArtist && artworkUri == currentArtworkUri) {
      return
    }
    currentTitle = title
    currentArtist = artist
    // Only reload bitmap if artwork actually changed
    if (artworkUri != currentArtworkUri) {
      currentArtworkUri = artworkUri
      currentBitmap?.recycle()
      currentBitmap = loadBitmap(artworkUri)
    }
    updateMediaSessionMetadata()
    updateNotification()
  }

  fun updatePlaybackState(playing: Boolean) {
    if (playing == isPlaying) return
    isPlaying = playing
    updateMediaSessionPlaybackState()
    updateNotification()
  }

  // --- MediaSession ---

  private fun setupMediaSession() {
    mediaSession = MediaSessionCompat(this, SESSION_TAG).apply {
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() {
          isPlaying = true
          onRemotePlay?.invoke()
          updateMediaSessionPlaybackState()
          updateNotification()
        }

        override fun onPause() {
          isPlaying = false
          onRemotePause?.invoke()
          updateMediaSessionPlaybackState()
          updateNotification()
        }

        override fun onStop() {
          onRemoteStop?.invoke()
          stopForeground(STOP_FOREGROUND_REMOVE)
          stopSelf()
        }
      })
      isActive = true
    }
  }

  private fun updateMediaSessionMetadata() {
    mediaSession?.setMetadata(
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
        .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "")
        .apply {
          currentBitmap?.let {
            putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it)
          }
        }
        .build()
    )
  }

  private fun updateMediaSessionPlaybackState() {
    val state = if (isPlaying) {
      PlaybackStateCompat.STATE_PLAYING
    } else {
      PlaybackStateCompat.STATE_PAUSED
    }
    mediaSession?.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_STOP
        )
        .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
        .build()
    )
  }

  // --- Notification ---

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Radio Playback",
        NotificationManager.IMPORTANCE_LOW // No sound, shows silently
      ).apply {
        description = "Media playback controls for Olha que Duas radio"
        setShowBadge(false)
      }
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.createNotificationChannel(channel)
    }
  }

  private fun buildNotification(): Notification {
    // Content intent: tap notification to open the app
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val contentPendingIntent = PendingIntent.getActivity(
      this, 0, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    // Play/Pause action
    val playPauseAction = if (isPlaying) {
      val pauseIntent = Intent(this, MediaPlaybackService::class.java).apply {
        action = ACTION_PAUSE
      }
      val pausePending = PendingIntent.getService(
        this, 1, pauseIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      NotificationCompat.Action.Builder(
        android.R.drawable.ic_media_pause,
        "Pause",
        pausePending
      ).build()
    } else {
      val playIntent = Intent(this, MediaPlaybackService::class.java).apply {
        action = ACTION_PLAY
      }
      val playPending = PendingIntent.getService(
        this, 1, playIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      NotificationCompat.Action.Builder(
        android.R.drawable.ic_media_play,
        "Play",
        playPending
      ).build()
    }

    // Stop action
    val stopIntent = Intent(this, MediaPlaybackService::class.java).apply {
      action = ACTION_STOP
    }
    val stopPending = PendingIntent.getService(
      this, 2, stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val stopAction = NotificationCompat.Action.Builder(
      android.R.drawable.ic_menu_close_clear_cancel,
      "Stop",
      stopPending
    ).build()

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(currentTitle)
      .setContentText(currentArtist)
      .setSmallIcon(getApplicationSmallIcon())
      .setContentIntent(contentPendingIntent)
      .addAction(playPauseAction)
      .addAction(stopAction)
      .setStyle(
        MediaStyle()
          .setMediaSession(mediaSession?.sessionToken)
          .setShowActionsInCompactView(0) // Show play/pause in compact view
      )
      .setOngoing(isPlaying)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setSilent(true)

    currentBitmap?.let { builder.setLargeIcon(it) }

    return builder.build()
  }

  private fun updateNotification() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(NOTIFICATION_ID, buildNotification())
  }

  private fun getApplicationSmallIcon(): Int {
    // Use the app's launcher icon as notification icon.
    // For a proper monochrome icon, the app can add a drawable resource later.
    return applicationInfo.icon
  }

  // --- Artwork ---

  private fun loadBitmap(uri: String): Bitmap? {
    if (uri.isEmpty()) return null
    return try {
      val path = uri.removePrefix("file://")
      val opts = BitmapFactory.Options().apply {
        // Limit bitmap size for notification (max 512x512 is plenty)
        inSampleSize = 1
      }
      val raw = BitmapFactory.decodeFile(path, opts) ?: return null
      // Scale down if too large to avoid TransactionTooLargeException
      if (raw.width > 512 || raw.height > 512) {
        val scale = 512.0f / maxOf(raw.width, raw.height)
        val scaled = Bitmap.createScaledBitmap(
          raw,
          (raw.width * scale).toInt(),
          (raw.height * scale).toInt(),
          true
        )
        if (scaled !== raw) raw.recycle()
        scaled
      } else {
        raw
      }
    } catch (e: Exception) {
      null
    }
  }

  // --- WiFi Lock ---

  @Suppress("DEPRECATION")
  private fun acquireWifiLock() {
    try {
      val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        ?: return
      wifiLock = wifiManager.createWifiLock(
        WifiManager.WIFI_MODE_FULL_HIGH_PERF,
        "olhaqueduas:radio-stream"
      ).apply {
        setReferenceCounted(false)
        acquire()
      }
    } catch (_: Exception) {
      // Best effort — some devices don't support WiFi lock
    }
  }

  private fun releaseWifiLock() {
    try {
      wifiLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {
      // ignore
    }
    wifiLock = null
  }
}
