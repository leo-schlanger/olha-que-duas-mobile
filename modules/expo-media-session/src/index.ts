import type { EventSubscription } from 'expo-modules-core';
import ExpoMediaSessionModule from './ExpoMediaSessionModule';

export interface MediaMetadata {
  title: string;
  artist: string;
  /** file:// URI pointing to a local image, or '' for no artwork */
  artworkUri: string;
}

/**
 * Start the foreground media service with initial metadata.
 * Creates the notification, MediaSession, and WiFi lock.
 * If the service is already running, updates metadata and re-foregrounds.
 */
export function activate(meta: MediaMetadata): void {
  ExpoMediaSessionModule.activate(meta.title, meta.artist, meta.artworkUri);
}

/**
 * Update notification metadata (title, artist, artwork).
 * No-op if the service isn't running yet.
 */
export function updateMetadata(meta: MediaMetadata): void {
  ExpoMediaSessionModule.updateMetadata(meta.title, meta.artist, meta.artworkUri);
}

/**
 * Update the playback state on the notification and lock screen.
 */
export function updatePlaybackState(isPlaying: boolean): void {
  ExpoMediaSessionModule.updatePlaybackState(isPlaying);
}

/**
 * Start native now-playing resolution. The MediaService owns the
 * notification metadata: it reacts to ICY title changes (see attachPlayer)
 * and polls the AzuraCast API on its own thread, independent of the JS
 * thread (whose timers are paused in background).
 */
export function startMetadataPolling(pollingUrl: string): void {
  ExpoMediaSessionModule.startMetadataPolling(pollingUrl);
}

/**
 * Stop native-side metadata polling.
 */
export function stopMetadataPolling(): void {
  ExpoMediaSessionModule.stopMetadataPolling();
}

/**
 * Stop the foreground service and remove the notification.
 * Releases WiFi lock and MediaSession.
 */
export function deactivate(): void {
  ExpoMediaSessionModule.deactivate();
}

/**
 * Attach to the ExoPlayer behind an expo-audio AudioPlayer to receive the
 * stream's ICY StreamTitle (in-band, in sync with the audio). Resolves false
 * when the player can't be attached (e.g. iOS).
 */
export async function attachPlayer(player: object): Promise<boolean> {
  try {
    return (await ExpoMediaSessionModule.attachPlayer?.(player)) ?? false;
  } catch {
    return false;
  }
}

/** Stop listening to the previously attached player. */
export async function detachPlayer(): Promise<void> {
  try {
    await ExpoMediaSessionModule.detachPlayer?.();
  } catch {
    // ignore
  }
}

/**
 * Wait `ms` using a native timer. React Native pauses JS timers while the app
 * is in background, so anything that must happen with the screen off (e.g.
 * stream reconnect back-off) should wait with this instead of setTimeout.
 */
export function sleep(ms: number): Promise<void> {
  if (typeof ExpoMediaSessionModule.sleep === 'function') {
    return ExpoMediaSessionModule.sleep(ms).catch(
      () => new Promise<void>((resolve) => setTimeout(resolve, ms))
    );
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ICY StreamTitle changed — the listener is hearing a new item right now. */
export function addStreamTitleListener(listener: (title: string) => void): EventSubscription {
  return ExpoMediaSessionModule.addListener('onStreamTitle', (event: { title: string }) =>
    listener(event?.title ?? '')
  );
}

/**
 * The attached player failed (network lost, server down...). expo-audio
 * itself doesn't report this — the player just goes idle.
 */
export function addStreamErrorListener(listener: (code: string) => void): EventSubscription {
  return ExpoMediaSessionModule.addListener('onStreamError', (event: { code: string }) =>
    listener(event?.code ?? '')
  );
}

/** User pressed Play on notification / lock screen / headset button. */
export function addRemotePlayListener(listener: () => void): EventSubscription {
  return ExpoMediaSessionModule.addListener('onRemotePlay', listener);
}

/** User pressed Pause on notification / lock screen / headset button. */
export function addRemotePauseListener(listener: () => void): EventSubscription {
  return ExpoMediaSessionModule.addListener('onRemotePause', listener);
}

/** User pressed Stop on notification, or swiped notification away. */
export function addRemoteStopListener(listener: () => void): EventSubscription {
  return ExpoMediaSessionModule.addListener('onRemoteStop', listener);
}

/**
 * Whether the app is exempt from battery optimization (Doze). On aggressive
 * OEMs, reliable background metadata/artwork updates depend on this.
 * Resolves to false on platforms/versions where it can't be determined.
 */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  try {
    return await ExpoMediaSessionModule.isIgnoringBatteryOptimizations();
  } catch {
    return false;
  }
}

/**
 * Show the Android system dialog asking the user to exempt the app from
 * battery optimization. No-op if unavailable.
 */
export function requestIgnoreBatteryOptimizations(): void {
  ExpoMediaSessionModule.requestIgnoreBatteryOptimizations?.();
}
