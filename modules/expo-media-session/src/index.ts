import ExpoMediaSessionModule from './ExpoMediaSessionModule';

export interface MediaMetadata {
  title: string;
  artist: string;
  /** Must be a file:// URI pointing to a local image */
  artworkUri: string;
}

/**
 * Acquire WiFi lock to prevent Android from killing WiFi with screen off.
 * Must be called when radio playback starts.
 */
export function activate(meta: MediaMetadata): void {
  ExpoMediaSessionModule.activate(meta.title, meta.artist, meta.artworkUri);
}

/**
 * Release WiFi lock and cancel any pending artwork overrides.
 */
export function deactivate(): void {
  ExpoMediaSessionModule.deactivate();
}

/**
 * Override the artwork on expo-audio's media notification.
 *
 * Finds the notification on channel "expo_audio_channel", loads the bitmap
 * from the given file:// URI, and re-posts with the new large icon.
 * Uses an immediate attempt + 6 retries at increasing delays (up to 5s)
 * on a dedicated background thread for reliability in background.
 */
export function overrideNotificationArtwork(artworkUri: string): void {
  ExpoMediaSessionModule.overrideNotificationArtwork(artworkUri);
}
