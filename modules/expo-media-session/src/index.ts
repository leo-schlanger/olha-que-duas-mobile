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
 * Start native-side metadata polling. The MediaService will poll the
 * AzuraCast API directly on its own thread, bypassing the JS thread
 * which Android suspends when the app is backgrounded. This ensures
 * the lock screen / notification stays up-to-date.
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
