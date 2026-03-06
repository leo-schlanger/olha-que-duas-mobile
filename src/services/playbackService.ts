import TrackPlayer, { Event } from 'react-native-track-player';

/**
 * Playback Service for react-native-track-player
 * This service runs in the background and handles remote events (lockscreen controls, etc.)
 *
 * IMPORTANT: This service runs even when the app is in background or killed.
 * It handles all remote media controls from:
 * - Lock screen controls
 * - Notification controls
 * - Headphone/Bluetooth controls
 * - Android Auto / CarPlay controls
 */
export async function PlaybackService() {
  // Remote play button pressed (notification, lockscreen, headphones)
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    console.log('[PlaybackService] RemotePlay event received');
    await TrackPlayer.play();
  });

  // Remote pause button pressed
  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    console.log('[PlaybackService] RemotePause event received');
    await TrackPlayer.pause();
  });

  // Remote stop button pressed
  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    console.log('[PlaybackService] RemoteStop event received');
    await TrackPlayer.stop();
  });

  // Handle headphone/bluetooth disconnection and audio focus
  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    console.log('[PlaybackService] RemoteDuck event:', event);

    if (event.paused) {
      // Another app took audio focus temporarily, pause
      // This happens during notifications, etc.
      await TrackPlayer.setVolume(0.2);
    } else if (event.permanent) {
      // Permanent loss of focus (e.g., phone call ended)
      // Resume playback at full volume
      await TrackPlayer.setVolume(1);
      await TrackPlayer.play();
    } else {
      // Ducking ended, restore volume
      await TrackPlayer.setVolume(1);
    }
  });

  // Handle seek forward (if supported)
  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    console.log('[PlaybackService] RemoteSeek event:', event.position);
    // For live streams, seeking is not applicable
    // But we handle it for completeness
  });

  // Handle playback state changes for logging
  TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
    console.log('[PlaybackService] PlaybackState changed:', event.state);
  });

  // Handle playback errors
  TrackPlayer.addEventListener(Event.PlaybackError, (error) => {
    console.error('[PlaybackService] Playback error:', error);
  });

  // Handle when app is brought to foreground
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
    if (event.track) {
      console.log('[PlaybackService] Active track:', event.track.title);
    }
  });

  // Handle playback queue ended (shouldn't happen for live stream)
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, (event) => {
    console.log('[PlaybackService] Queue ended, position:', event.position);
  });

  console.log('[PlaybackService] Service registered and ready');
}
