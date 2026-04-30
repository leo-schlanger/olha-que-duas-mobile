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
import android.os.Looper
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * Foreground service that owns the entire media session and notification.
 *
 * Threading model:
 *   - MediaSession and Notification updates run on the MAIN thread
 *   - Bitmap decoding runs on a dedicated HandlerThread ("media-artwork")
 *   - After decoding, updates are posted back to the main thread
 */
class MediaService : Service() {

  companion object {
    const val CHANNEL_ID = "olhaqueduas_radio"
    const val NOTIFICATION_ID = 1001

    const val ACTION_ACTIVATE = "expo.modules.mediasession.ACTIVATE"
    const val ACTION_PLAY = "expo.modules.mediasession.PLAY"
    const val ACTION_PAUSE = "expo.modules.mediasession.PAUSE"
    const val ACTION_STOP = "expo.modules.mediasession.STOP"
    const val POLL_INTERVAL_MS = 10_000L

    @Volatile
    var instance: MediaService? = null
      private set

    /** Callback into ExpoMediaSessionModule to emit JS events. */
    @Volatile
    var transportCallback: ((String) -> Unit)? = null

    /** One-shot callback fired after ACTION_ACTIVATE completes. */
    @Volatile
    var onReadyCallback: (() -> Unit)? = null
  }

  private var mediaSession: MediaSession? = null
  private var wifiLock: WifiManager.WifiLock? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  private var currentTitle = ""
  private var currentArtist = ""
  private var currentBitmap: Bitmap? = null
  private var cachedArtworkUri = ""
  private var isPlaying = false

  // Monotonic counter — each artwork request gets a unique ID so stale
  // results from a previous download are discarded.
  private var artworkRequestId = 0L

  // Safety Runnable: flushes the pending queue if artwork download hangs.
  // Kept as a named reference so it can be cancelled when artwork arrives early.
  private val flushReadyTimeout = Runnable { flushReady() }

  // Background thread for bitmap decoding AND metadata polling — keeps main thread free.
  private val artworkThread = HandlerThread("media-artwork").apply { start() }
  private val artworkHandler = Handler(artworkThread.looper)

  // ---- Native metadata polling (runs when JS thread is suspended in background) ----
  private var pollingUrl: String? = null
  private var pollingActive = false
  private var lastPolledTitle = ""
  private var lastPolledArtist = ""

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    createNotificationChannel()
    initMediaSession()
    acquireWifiLock()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Guard: null intent (re-delivery after crash or system restart).
    // Must call goForeground() to satisfy the 5-second foreground requirement.
    if (intent?.action == null) {
      goForeground()
      return START_NOT_STICKY
    }

    when (intent.action) {
      ACTION_ACTIVATE -> {
        currentTitle = intent.getStringExtra("title") ?: currentTitle
        currentArtist = intent.getStringExtra("artist") ?: currentArtist
        val artworkUri = intent.getStringExtra("artworkUri") ?: ""

        updateSessionMetadata()
        goForeground()

        // Load artwork on background thread, post results to main thread.
        if (artworkUri.isNotEmpty() && artworkUri != cachedArtworkUri) {
          val uriCopy = artworkUri
          val requestId = ++artworkRequestId
          artworkHandler.post {
            val bitmap = loadBitmap(uriCopy)
            mainHandler.post {
              // Only apply if this is still the latest request (prevents stale overwrites).
              if (requestId == artworkRequestId && bitmap != null) {
                currentBitmap = bitmap
                cachedArtworkUri = uriCopy
                updateSessionMetadata()
                postNotification()
              }
              // Flush pending after artwork is resolved (or failed).
              flushReady()
            }
          }
          // Safety: if artwork download hangs, flush pending after 10s anyway.
          mainHandler.postDelayed(flushReadyTimeout, 10_000)
        } else {
          // No artwork to load — flush pending immediately.
          flushReady()
        }
      }

      ACTION_PLAY -> transportCallback?.invoke("onRemotePlay")
      ACTION_PAUSE -> transportCallback?.invoke("onRemotePause")
      ACTION_STOP -> transportCallback?.invoke("onRemoteStop")
    }
    return START_NOT_STICKY
  }

  private fun flushReady() {
    // Cancel the safety timeout if artwork arrived before it fired.
    mainHandler.removeCallbacks(flushReadyTimeout)
    onReadyCallback?.invoke()
    onReadyCallback = null
  }

  override fun onDestroy() {
    instance = null
    stopMetadataPolling()
    releaseWifiLock()
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
    artworkHandler.removeCallbacksAndMessages(null)
    artworkThread.quitSafely()
    cachedArtworkUri = ""
    // Don't recycle currentBitmap — Android may still reference it in the
    // notification system. Let GC collect it.
    currentBitmap = null
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    transportCallback?.invoke("onRemoteStop")
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  // =========================================================================
  // Public API — called from ExpoMediaSessionModule (main thread)
  // =========================================================================

  fun updateMetadata(title: String, artist: String, artworkUri: String?) {
    currentTitle = title
    currentArtist = artist

    if (!artworkUri.isNullOrEmpty() && artworkUri != cachedArtworkUri) {
      val uriCopy = artworkUri
      val requestId = ++artworkRequestId
      // Update title/artist immediately (no artwork yet).
      updateSessionMetadata()
      postNotification()

      // Load artwork on background thread, post result to main thread.
      artworkHandler.post {
        val bitmap = loadBitmap(uriCopy)
        mainHandler.post {
          // Only apply if this is still the latest request.
          if (requestId == artworkRequestId && bitmap != null) {
            currentBitmap = bitmap
            cachedArtworkUri = uriCopy
            updateSessionMetadata()
            postNotification()
          }
        }
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
      // isActive set after transportCallback is wired in onStartCommand.
    }
    // Set initial paused state with available actions.
    updatePlaybackState(false)
  }

  // =========================================================================
  // Notification
  // =========================================================================

  private fun goForeground() {
    // Activate session now — transportCallback is wired by this point.
    mediaSession?.isActive = true

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
      // Best effort
    }
  }

  private fun buildNotification(): Notification {
    val sessionToken = mediaSession?.sessionToken

    val contentIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(
        this, 0, it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

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

  private fun getSmallIconRes(): Int {
    val notifIcon = resources.getIdentifier("notification_icon", "drawable", packageName)
    if (notifIcon != 0) return notifIcon
    return applicationInfo.icon
  }

  // =========================================================================
  // Bitmap loading — scale to 512x512, ensure opaque
  // Runs on artworkHandler thread. Intermediate bitmaps are recycled;
  // only the final bitmap is kept alive for the notification.
  // =========================================================================

  private fun loadBitmap(artworkUri: String): Bitmap? {
    var current: Bitmap? = null
    try {
      current = if (artworkUri.startsWith("http://") || artworkUri.startsWith("https://")) {
        downloadBitmap(artworkUri)
      } else {
        val path = artworkUri.removePrefix("file://")
        BitmapFactory.decodeFile(path)
      } ?: return null

      // Scale down to max 512x512.
      if (current.width > 512 || current.height > 512) {
        val scale = 512.0f / maxOf(current.width, current.height)
        val scaled = Bitmap.createScaledBitmap(
          current,
          (current.width * scale).toInt(),
          (current.height * scale).toInt(),
          true
        )
        if (scaled !== current) {
          current.recycle()
          current = scaled
        }
      }

      // Ensure opaque background (Android 13 transparency overlap fix).
      if (current.hasAlpha()) {
        val opaque = Bitmap.createBitmap(current.width, current.height, Bitmap.Config.ARGB_8888)
        Canvas(opaque).apply {
          drawColor(Color.BLACK)
          drawBitmap(current, 0f, 0f, null)
        }
        current.recycle()
        current = opaque
      }

      return current
    } catch (_: Exception) {
      // If anything fails mid-chain, don't leak the intermediate bitmap.
      // But only recycle if it hasn't already been recycled.
      current?.let { if (!it.isRecycled) it.recycle() }
      return null
    }
  }

  private fun downloadBitmap(url: String): Bitmap? {
    var conn: HttpURLConnection? = null
    try {
      conn = URL(url).openConnection() as HttpURLConnection
      conn.connectTimeout = 8000
      conn.readTimeout = 8000

      // Reject unreasonably large files (> 5 MB).
      val contentLength = conn.contentLength
      if (contentLength > 5 * 1024 * 1024) return null

      return conn.inputStream.use { stream ->
        BitmapFactory.decodeStream(stream)
      }
    } catch (_: Exception) {
      return null
    } finally {
      conn?.disconnect()
    }
  }

  // =========================================================================
  // MediaSession metadata (must run on main thread)
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
  // Native metadata polling — runs on artworkHandler thread independently
  // of the JS thread, which Android suspends when the app is backgrounded.
  // This ensures the lock screen / notification stays up-to-date even when
  // the React Native JS event loop is frozen.
  // =========================================================================

  private val metadataPollingRunnable = object : Runnable {
    override fun run() {
      if (!pollingActive) return
      pollMetadataFromApi()
      artworkHandler.postDelayed(this, POLL_INTERVAL_MS)
    }
  }

  fun startMetadataPolling(url: String) {
    pollingUrl = url
    pollingActive = true
    // Sync dedup state so the first poll doesn't repeat what JS already set.
    lastPolledTitle = currentTitle
    lastPolledArtist = currentArtist
    artworkHandler.removeCallbacks(metadataPollingRunnable)
    artworkHandler.postDelayed(metadataPollingRunnable, POLL_INTERVAL_MS)
    Log.w("MediaService", "Metadata polling started: $url")
  }

  fun stopMetadataPolling() {
    pollingActive = false
    artworkHandler.removeCallbacks(metadataPollingRunnable)
    Log.w("MediaService", "Metadata polling stopped")
  }

  private fun pollMetadataFromApi() {
    val url = pollingUrl ?: return
    var conn: HttpURLConnection? = null
    try {
      conn = URL(url).openConnection() as HttpURLConnection
      conn.connectTimeout = 8000
      conn.readTimeout = 8000
      conn.setRequestProperty("Accept", "application/json")

      if (conn.responseCode != 200) return

      val body = conn.inputStream.bufferedReader().readText()
      val json = JSONObject(body)

      val nowPlaying = json.optJSONObject("now_playing") ?: return
      val song = nowPlaying.optJSONObject("song") ?: return
      val title = song.optString("title", "").trim()
      val artist = song.optString("artist", "").trim()
      val artUrl = song.optString("art", "")

      // Skip empty/invalid entries
      if (title.isEmpty() || artist.isEmpty()) return
      if (artist.equals("unknown", ignoreCase = true)) return

      // Skip if nothing changed (dedup)
      if (title == lastPolledTitle && artist == lastPolledArtist) return

      lastPolledTitle = title
      lastPolledArtist = artist
      Log.w("MediaService", "Poll detected change: '$title' / '$artist'")

      // Post metadata update to main thread
      mainHandler.post {
        updateMetadata(title, artist, artUrl)
      }
    } catch (e: Exception) {
      Log.w("MediaService", "Poll failed: ${e.message}")
    } finally {
      conn?.disconnect()
    }
  }

  // =========================================================================
  // WiFi lock
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
    } catch (_: Exception) {}
  }

  private fun releaseWifiLock() {
    try {
      wifiLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {}
    wifiLock = null
  }
}
