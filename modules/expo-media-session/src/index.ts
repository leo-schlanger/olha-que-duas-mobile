import { EventEmitter, type EventSubscription } from 'expo-modules-core';
import ExpoMediaSessionModule from './ExpoMediaSessionModule';

type MediaSessionEvents = {
  onRemotePlay: () => void;
  onRemotePause: () => void;
  onRemoteStop: () => void;
};

const emitter = new EventEmitter<MediaSessionEvents>(ExpoMediaSessionModule);

export interface MediaMetadata {
  title: string;
  artist: string;
  /** Must be a file:// URI pointing to a local image */
  artworkUri: string;
}

/**
 * Start the foreground media service with initial metadata.
 * Must be called before any other method.
 */
export function activate(meta: MediaMetadata): void {
  ExpoMediaSessionModule.activate(meta.title, meta.artist, meta.artworkUri);
}

/**
 * Update the notification/lock-screen metadata and artwork.
 * artworkUri must be a file:// URI (pre-downloaded by artworkCache).
 */
export function updateMetadata(meta: MediaMetadata): void {
  ExpoMediaSessionModule.updateMetadata(meta.title, meta.artist, meta.artworkUri);
}

/**
 * Update the play/pause state shown on the notification.
 */
export function updatePlaybackState(isPlaying: boolean): void {
  ExpoMediaSessionModule.updatePlaybackState(isPlaying);
}

/**
 * Stop the foreground service and release the MediaSession.
 */
export function deactivate(): void {
  ExpoMediaSessionModule.deactivate();
}

/**
 * Listen for remote play command (lock screen / notification / Bluetooth).
 */
export function addOnRemotePlayListener(callback: () => void): EventSubscription {
  return emitter.addListener('onRemotePlay', callback);
}

/**
 * Listen for remote pause command.
 */
export function addOnRemotePauseListener(callback: () => void): EventSubscription {
  return emitter.addListener('onRemotePause', callback);
}

/**
 * Listen for remote stop command.
 */
export function addOnRemoteStopListener(callback: () => void): EventSubscription {
  return emitter.addListener('onRemoteStop', callback);
}

/**
 * Override the artwork on expo-audio's media notification.
 * Finds the notification on channel "expo_audio_channel", loads the bitmap
 * from the given file:// URI, and re-posts with the new large icon.
 * Runs with a 200ms delay to ensure expo-audio's rebuild has completed.
 */
export function overrideNotificationArtwork(artworkUri: string): void {
  ExpoMediaSessionModule.overrideNotificationArtwork(artworkUri);
}
