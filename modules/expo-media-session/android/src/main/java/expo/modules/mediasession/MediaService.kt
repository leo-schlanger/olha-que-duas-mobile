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
import android.os.PowerManager
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
    const val USER_AGENT = "OlhaQueDuas-Android"
    // How far behind the server the listener hears (Icecast burst + decoder
    // buffer). Only used when the stream gives no ICY metadata.
    const val LISTENER_DELAY_S = 5L
    const val ICY_RETRY_MS = 1_500L
    const val ICY_MAX_RETRIES = 4
    // Ignore an ICY title older than this (stream without metadata updates).
    const val ICY_STALE_MS = 15 * 60_000L
    const val MIN_SONG_DURATION_S = 25.0

    // Mirrors the site's classification (olha-que-duas/src/hooks/useNowPlaying.ts).
    val JINGLE_PATTERNS = listOf(
      "^jingle", "^vinheta", "^id\\s", "^spot", "^promo", "^interrup", "^bumper",
      "^sweeper", "^liner", "^station\\s?id", "^hora\\s?certa", "^cortina"
    ).map { Regex(it, RegexOption.IGNORE_CASE) }
    val JINGLE_PLAYLISTS = listOf("jingle", "vinheta", "interrup", "spot", "promo")
      .map { Regex(it, RegexOption.IGNORE_CASE) }
    val ANNOUNCEMENT_PLAYLISTS = listOf(
      "an[uú]ncio", "destaqu", "aviso", "evento", "especiais infantil"
    ).map { Regex(it, RegexOption.IGNORE_CASE) }
    val MUSIC_PLAYLISTS = listOf(
      "mix", "rotation", "playlist", "morning", "afternoon", "sunset", "night",
      "madrugada", "noite", "tarde", "manh[ãa]", "top\\s?\\d", "hits", "chill",
      "lounge", "general", "default", "shuffle", "lunch", "beats", "break", "power",
      "hour", "midnight", "session", "relax", "flow", "wake", "especial", "infantil"
    ).map { Regex(it, RegexOption.IGNORE_CASE) }

    /** Polling URL requested before the service finished starting. */
    @Volatile
    var pendingPollingUrl: String? = null

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
  private var cpuWakeLock: PowerManager.WakeLock? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  private var currentTitle = ""
  private var currentArtist = ""
  private var currentBitmap: Bitmap? = null
  private var cachedArtworkUri = ""
  private var isPlaying = false

  // Station logo, kept as a fallback so that when a track's artwork fails to
  // download (e.g. constrained network in background/Doze) we show the logo
  // instead of leaving the PREVIOUS track's cover on screen.
  private var fallbackBitmap: Bitmap? = null

  // Monotonic counter — each artwork request gets a unique ID so stale
  // results from a previous download are discarded.
  private var artworkRequestId = 0L

  // Safety Runnable: flushes the pending queue if artwork download hangs.
  // Kept as a named reference so it can be cancelled when artwork arrives early.
  private val flushReadyTimeout = Runnable { flushReady() }

  // Background thread for bitmap decoding AND metadata polling — keeps main thread free.
  private val artworkThread = HandlerThread("media-artwork").apply { start() }
  private val artworkHandler = Handler(artworkThread.looper)

  // Separate thread for prefetching the NEXT cover, so a slow download never
  // delays reacting to an ICY title change on artworkHandler.
  private val prefetchThread = HandlerThread("media-prefetch").apply { start() }
  private val prefetchHandler = Handler(prefetchThread.looper)

  // ---- Now-playing resolution (ICY + API), runs on artworkHandler ----
  @Volatile private var pollingUrl: String? = null
  @Volatile private var pollingActive = false
  @Volatile private var lastAppliedKey = ""
  private var lastIcyTitle: String? = null
  private var lastIcyAt = 0L
  private var icyAttempts = 0
  private var lastPrefetchedArt = ""
  @Volatile private var stationName = ""
  @Volatile private var stationTagline = ""

  // Small LRU of decoded covers (current + prefetched next + a couple back).
  private val bitmapCache = object : LinkedHashMap<String, Bitmap>(8, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Bitmap>?) = size > 4
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    createNotificationChannel()
    initMediaSession()
    acquireWifiLock()
    acquireCpuWakeLock()
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
        // The activation metadata is the station identity — reused as the
        // neutral state (jingles, gaps) by the now-playing resolution.
        stationName = currentTitle
        stationTagline = currentArtist
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
                // The initial activate artwork is the station logo — keep it
                // as the fallback used when a track's cover fails to load.
                if (fallbackBitmap == null) fallbackBitmap = bitmap
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

        pendingPollingUrl?.let {
          pendingPollingUrl = null
          startMetadataPolling(it)
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
    releaseCpuWakeLock()
    releaseWifiLock()
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
    artworkHandler.removeCallbacksAndMessages(null)
    artworkThread.quitSafely()
    prefetchHandler.removeCallbacksAndMessages(null)
    prefetchThread.quitSafely()
    synchronized(bitmapCache) { bitmapCache.clear() }
    cachedArtworkUri = ""
    // Don't recycle currentBitmap — Android may still reference it in the
    // notification system. Let GC collect it.
    currentBitmap = null
    fallbackBitmap = null
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

    if (artworkUri.isNullOrEmpty()) {
      // No cover for this item: show the station logo, never the previous
      // track's cover.
      ++artworkRequestId
      currentBitmap = fallbackBitmap
      cachedArtworkUri = ""
      updateSessionMetadata()
      postNotification()
      return
    }

    val cached = if (artworkUri != cachedArtworkUri) cachedBitmap(artworkUri) else null
    if (cached != null) {
      // Prefetched cover: swap title + artwork in one go.
      ++artworkRequestId
      currentBitmap = cached
      cachedArtworkUri = artworkUri
      updateSessionMetadata()
      postNotification()
      return
    }

    if (artworkUri != cachedArtworkUri) {
      val uriCopy = artworkUri
      val requestId = ++artworkRequestId
      // Update title/artist immediately; until the new cover arrives show
      // the logo rather than pairing the new title with the old cover.
      currentBitmap = fallbackBitmap ?: currentBitmap
      updateSessionMetadata()
      postNotification()

      // Load artwork on background thread, post result to main thread.
      artworkHandler.post {
        var bitmap = loadBitmap(uriCopy)
        // One retry on failure — in background/Doze the first connection can
        // be dropped by the network restrictions even while audio streams.
        if (bitmap == null) {
          try {
            Thread.sleep(1500)
          } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
          }
          bitmap = loadBitmap(uriCopy)
        }
        val resolved = bitmap
        mainHandler.post {
          // Only apply if this is still the latest request.
          if (requestId == artworkRequestId) {
            if (resolved != null) {
              currentBitmap = resolved
              cachedArtworkUri = uriCopy
              cacheBitmap(uriCopy, resolved)
            } else {
              // New track but its cover is unavailable. Drop the stale cover
              // (showing the PREVIOUS song's art was the reported bug) and
              // fall back to the station logo. cachedArtworkUri is left
              // unchanged so a later poll can retry this same artwork.
              currentBitmap = fallbackBitmap
            }
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
      conn.instanceFollowRedirects = true
      conn.setRequestProperty("User-Agent", USER_AGENT)

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
  // Now-playing resolution — runs on artworkHandler thread, independent of
  // the JS thread (whose timers React Native pauses in background).
  //
  // Primary signal: ICY StreamTitle from the stream itself (onStreamTitle),
  // delivered by ExoPlayer exactly when that audio is played. On each change
  // we fetch the AzuraCast API and pick the entry whose text matches it, so
  // title + artwork change together with the sound (same idea as the site).
  // Fallback (no ICY): periodic polling with a listener-delay offset.
  //
  // This service is the ONLY writer of the notification metadata while
  // playing; classification mirrors the site (pickCategory in useNowPlaying).
  // =========================================================================

  private val metadataPollingRunnable = object : Runnable {
    override fun run() {
      if (!pollingActive) return
      val delay = resolveNowPlaying()
      artworkHandler.removeCallbacks(this)
      artworkHandler.postDelayed(this, delay)
    }
  }

  fun startMetadataPolling(url: String) {
    pollingUrl = url
    pollingActive = true
    lastAppliedKey = ""
    artworkHandler.removeCallbacks(metadataPollingRunnable)
    // First resolution right away so the notification leaves the generic
    // "radio name" state as soon as possible.
    artworkHandler.post(metadataPollingRunnable)
    Log.w("MediaService", "Metadata polling started: $url")
  }

  fun stopMetadataPolling() {
    pollingActive = false
    artworkHandler.removeCallbacks(metadataPollingRunnable)
    artworkHandler.removeCallbacks(icyRetryRunnable)
    lastIcyTitle = null
    Log.w("MediaService", "Metadata polling stopped")
  }

  /** Called (main thread) by the module when the stream's ICY title changes. */
  fun onStreamTitle(title: String) {
    artworkHandler.post {
      lastIcyTitle = title
      lastIcyAt = System.currentTimeMillis()
      icyAttempts = 0
      artworkHandler.removeCallbacks(icyRetryRunnable)
      if (!pollingActive) return@post
      resolveNowPlaying()
    }
  }

  // The API usually lists the new entry before the listener hears it, but a
  // freshly-started track can lag a second or two — retry a few times.
  private val icyRetryRunnable = Runnable {
    if (pollingActive && lastIcyTitle != null) resolveNowPlaying()
  }

  private fun icyIsFresh(): Boolean =
    lastIcyTitle != null && System.currentTimeMillis() - lastIcyAt < ICY_STALE_MS

  /** Fetch + classify + apply. Returns the delay until the next poll. */
  private fun resolveNowPlaying(): Long {
    val json = fetchNowPlayingJson() ?: return POLL_INTERVAL_MS
    val icy = if (icyIsFresh()) lastIcyTitle else null

    val live = json.optJSONObject("live")
    if (live != null && live.optBoolean("is_live", false)) {
      val name = live.optString("streamer_name", "").trim().ifEmpty { "Programa ao Vivo" }
      applyMetadata(name, stationName, "")
      return POLL_INTERVAL_MS
    }

    val entry: JSONObject? = if (icy != null) {
      findEntryByText(json, icy)
    } else {
      pickEntryByClock(json)
    }

    if (icy != null && entry == null) {
      // ICY changed but the API doesn't list it yet: retry shortly, then
      // fall back to the ICY text itself (no artwork).
      if (icyAttempts < ICY_MAX_RETRIES) {
        icyAttempts++
        artworkHandler.removeCallbacks(icyRetryRunnable)
        artworkHandler.postDelayed(icyRetryRunnable, ICY_RETRY_MS)
      } else {
        val dash = icy.indexOf(" - ")
        val artist = if (dash > 0) icy.substring(0, dash).trim() else ""
        val title = if (dash > 0) icy.substring(dash + 3).trim() else icy
        if (isJingleText(title, artist) || title.isEmpty()) {
          applyIdle()
        } else {
          applyMetadata(title, artist.ifEmpty { stationName }, "")
        }
      }
    } else if (entry == null) {
      applyIdle()
    } else {
      applyEntry(entry)
    }

    prefetchNextArtwork(json)

    if (icy != null) return POLL_INTERVAL_MS
    // Without ICY, wake up right when the listener should hear the next
    // track instead of waiting for the regular interval.
    val np = json.optJSONObject("now_playing")
    val remaining = np?.optLong("remaining", -1L) ?: -1L
    if (remaining >= 0) {
      val untilTransition = (remaining + LISTENER_DELAY_S + 1) * 1000L
      return untilTransition.coerceIn(2_000L, POLL_INTERVAL_MS)
    }
    return POLL_INTERVAL_MS
  }

  private fun fetchNowPlayingJson(): JSONObject? {
    val url = pollingUrl ?: return null
    var conn: HttpURLConnection? = null
    return try {
      conn = URL(url).openConnection() as HttpURLConnection
      conn.connectTimeout = 8000
      conn.readTimeout = 8000
      conn.setRequestProperty("Accept", "application/json")
      conn.setRequestProperty("User-Agent", USER_AGENT)
      val code = conn.responseCode
      if (code != 200) {
        Log.w("MediaService", "Poll HTTP $code for $url")
        null
      } else {
        JSONObject(conn.inputStream.bufferedReader().readText())
      }
    } catch (e: Exception) {
      Log.w("MediaService", "Poll failed: ${e.message}")
      null
    } finally {
      conn?.disconnect()
    }
  }

  private fun normalizeText(s: String): String =
    s.lowercase().replace(Regex("\\s+"), " ").trim()

  // AzuraCast's `text` may include the album ("Artist - Album - Title") while
  // the ICY StreamTitle is "Artist - Title" — accept both forms.
  private fun entryTexts(entry: JSONObject): List<String> {
    val song = entry.optJSONObject("song") ?: return emptyList()
    val texts = mutableListOf<String>()
    val text = song.optString("text", "")
    if (text.isNotBlank()) texts.add(normalizeText(text))
    val artist = song.optString("artist", "")
    val title = song.optString("title", "")
    texts.add(normalizeText(if (artist.isNotBlank()) "$artist - $title" else title))
    return texts.filter { it.isNotEmpty() }
  }

  private fun findEntryByText(json: JSONObject, icy: String): JSONObject? {
    val wanted = normalizeText(icy)
    val candidates = mutableListOf<JSONObject>()
    json.optJSONObject("now_playing")?.let { candidates.add(it) }
    json.optJSONObject("playing_next")?.let { candidates.add(it) }
    json.optJSONArray("song_history")?.let { arr ->
      for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { candidates.add(it) }
    }
    return candidates.firstOrNull { entryTexts(it).contains(wanted) }
  }

  /** Entry the listener hears now, assuming ~LISTENER_DELAY_S of stream delay. */
  private fun pickEntryByClock(json: JSONObject): JSONObject? {
    val listener = System.currentTimeMillis() / 1000.0 - LISTENER_DELAY_S
    val candidates = mutableListOf<JSONObject>()
    json.optJSONObject("now_playing")?.let { candidates.add(it) }
    json.optJSONArray("song_history")?.let { arr ->
      for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { candidates.add(it) }
    }
    for (e in candidates) {
      val playedAt = e.optDouble("played_at", Double.NaN)
      val duration = e.optDouble("duration", Double.NaN)
      if (playedAt.isNaN() || duration.isNaN() || duration <= 0) continue
      if (playedAt <= listener && listener < playedAt + duration) return e
    }
    return null
  }

  private fun isJingleText(title: String, artist: String): Boolean =
    JINGLE_PATTERNS.any { it.containsMatchIn(title) || it.containsMatchIn(artist) }

  /** Same precedence as the site: live > jingle > announcement > music > podcast. */
  private fun applyEntry(entry: JSONObject) {
    val song = entry.optJSONObject("song")
    val title = song?.optString("title", "")?.trim().orEmpty()
    val artist = song?.optString("artist", "")?.trim().orEmpty()
    val art = song?.optString("art", "").orEmpty()
    val playlist = entry.optString("playlist", "").trim()
    val duration = entry.optDouble("duration", 0.0)

    val jingle = isJingleText(title, artist) ||
      (playlist.isNotEmpty() && JINGLE_PLAYLISTS.any { it.containsMatchIn(playlist) })
    if (jingle) {
      applyIdle()
      return
    }
    if (playlist.isNotEmpty() && ANNOUNCEMENT_PLAYLISTS.any { it.containsMatchIn(playlist) }) {
      applyMetadata(title.ifEmpty { playlist }, artist.ifEmpty { stationName }, art)
      return
    }
    val validArtist = artist.isNotEmpty() && !artist.equals("unknown", ignoreCase = true)
    val longEnough = duration <= 0 || duration >= MIN_SONG_DURATION_S
    if (title.isNotEmpty() && validArtist && longEnough) {
      applyMetadata(title, artist, art)
      return
    }
    val musicPlaylist = playlist.isEmpty() || MUSIC_PLAYLISTS.any { it.containsMatchIn(playlist) }
    if (musicPlaylist && title.isNotEmpty() && duration >= MIN_SONG_DURATION_S) {
      applyMetadata(title, artist.ifEmpty { stationName }, art)
      return
    }
    if (!musicPlaylist && duration >= MIN_SONG_DURATION_S) {
      applyMetadata(playlist, stationName, art)
      return
    }
    applyIdle()
  }

  private fun applyIdle() = applyMetadata(stationName, stationTagline, "")

  private fun applyMetadata(title: String, artist: String, artUrl: String) {
    val key = "$title\u0000$artist\u0000$artUrl"
    if (key == lastAppliedKey) return
    lastAppliedKey = key
    Log.w("MediaService", "Now playing: '$title' / '$artist' | art=${artUrl.takeLast(50)}")
    mainHandler.post { updateMetadata(title, artist, artUrl) }
  }

  /** Warm the bitmap cache with the next track's cover so the swap is instant. */
  private fun prefetchNextArtwork(json: JSONObject) {
    val art = json.optJSONObject("playing_next")?.optJSONObject("song")?.optString("art", "")
    if (art.isNullOrEmpty() || art == lastPrefetchedArt) return
    if (synchronized(bitmapCache) { bitmapCache.containsKey(art) }) return
    lastPrefetchedArt = art
    prefetchHandler.post { loadBitmap(art)?.let { cacheBitmap(art, it) } }
  }

  private fun cacheBitmap(uri: String, bitmap: Bitmap) {
    synchronized(bitmapCache) { bitmapCache[uri] = bitmap }
  }

  private fun cachedBitmap(uri: String): Bitmap? =
    synchronized(bitmapCache) { bitmapCache[uri] }?.takeIf { !it.isRecycled }

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

  // =========================================================================
  // CPU wake lock — keeps the CPU active so native threads (metadata polling)
  // continue running in background. Critical for OEM skins (Xiaomi, Samsung)
  // that aggressively throttle background threads even with foreground service.
  // =========================================================================

  private fun acquireCpuWakeLock() {
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
      cpuWakeLock = pm.newWakeLock(
        PowerManager.PARTIAL_WAKE_LOCK,
        "olhaqueduas:radio-cpu"
      ).apply {
        setReferenceCounted(false)
        acquire()
      }
      Log.w("MediaService", "CPU wake lock acquired")
    } catch (e: Exception) {
      Log.e("MediaService", "Failed to acquire CPU wake lock: ${e.message}")
    }
  }

  private fun releaseCpuWakeLock() {
    try {
      cpuWakeLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {}
    cpuWakeLock = null
  }
}
