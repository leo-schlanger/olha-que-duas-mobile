package expo.modules.mediasession

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Simplified Expo Module — provides WiFi lock to prevent Android from
 * killing the WiFi connection when the screen is off (which would drop
 * the ICY/HTTP audio stream). No notification or MediaSession — those
 * are handled by expo-audio's AudioControlsService.
 */
class ExpoMediaSessionModule : Module() {

  private var wifiLock: WifiManager.WifiLock? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoMediaSession")

    Events("onRemotePlay", "onRemotePause", "onRemoteStop")

    Function("activate") { _: String, _: String, _: String ->
      acquireWifiLock()
    }

    Function("updateMetadata") { _: String, _: String, _: String ->
      // No-op — notification handled by expo-audio's setActiveForLockScreen
    }

    Function("updatePlaybackState") { _: Boolean ->
      // No-op
    }

    Function("deactivate") {
      releaseWifiLock()
    }

    OnDestroy {
      releaseWifiLock()
    }
  }

  @Suppress("DEPRECATION")
  private fun acquireWifiLock() {
    if (wifiLock?.isHeld == true) return
    try {
      val ctx = appContext.reactContext ?: return
      val wifiManager = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        ?: return
      wifiLock = wifiManager.createWifiLock(
        WifiManager.WIFI_MODE_FULL_HIGH_PERF,
        "olhaqueduas:radio-stream"
      ).apply {
        setReferenceCounted(false)
        acquire()
      }
    } catch (e: Exception) {
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
