import TrackPlayer, { Event, State } from 'react-native-track-player';

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
  console.log('[PlaybackService] Initializing service...');

  // Store the last known volume for restoration
  let lastVolume = 1.0;
  let wasPlayingBeforeInterruption = false;

  // Remote play button pressed (notification, lockscreen, headphones)
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    console.log('[PlaybackService] RemotePlay event received');
    try {
      const state = await TrackPlayer.getPlaybackState();
      if (state.state !== State.Playing) {
        await TrackPlayer.play();
      }
    } catch (error) {
      console.error('[PlaybackService] Error handling RemotePlay:', error);
    }
  });

  // Remote pause button pressed
  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    console.log('[PlaybackService] RemotePause event received');
    try {
      await TrackPlayer.pause();
    } catch (error) {
      console.error('[PlaybackService] Error handling RemotePause:', error);
    }
  });

  // Remote stop button pressed
  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    console.log('[PlaybackService] RemoteStop event received');
    try {
      await TrackPlayer.stop();
    } catch (error) {
      console.error('[PlaybackService] Error handling RemoteStop:', error);
    }
  });

  // Handle headphone/bluetooth disconnection and audio focus
  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    console.log('[PlaybackService] RemoteDuck event:', event);

    try {
      if (event.paused) {
        // Temporary audio focus loss (e.g., notification sound)
        // Store current state and reduce volume
        const state = await TrackPlayer.getPlaybackState();
        wasPlayingBeforeInterruption = state.state === State.Playing;
        lastVolume = await TrackPlayer.getVolume();
        await TrackPlayer.setVolume(0.2);
      } else if (event.permanent) {
        // Permanent loss of focus ended (e.g., phone call finished)
        // Restore volume and resume if was playing
        await TrackPlayer.setVolume(lastVolume);
        if (wasPlayingBeforeInterruption) {
          await TrackPlayer.play();
        }
        wasPlayingBeforeInterruption = false;
      } else {
        // Ducking ended normally, restore volume
        await TrackPlayer.setVolume(lastVolume);
      }
    } catch (error) {
      console.error('[PlaybackService] Error handling RemoteDuck:', error);
    }
  });

  // Handle seek (not applicable for live streams, but required)
  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    console.log('[PlaybackService] RemoteSeek event:', event.position);
    // For live streams, seeking is not applicable
  });

  // Handle next/previous (not applicable for radio, but prevents errors)
  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    console.log('[PlaybackService] RemoteNext event (ignored for radio)');
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    console.log('[PlaybackService] RemotePrevious event (ignored for radio)');
  });

  // Handle playback state changes
  TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
    console.log('[PlaybackService] PlaybackState changed:', event.state);

    // If we're in error state, we might want to trigger reconnection
    // This is handled by radioService, but we log it here
    if (event.state === State.Error) {
      console.error('[PlaybackService] Playback entered error state');
    }
  });

  // Handle playback errors with detailed logging
  TrackPlayer.addEventListener(Event.PlaybackError, (error) => {
    console.error('[PlaybackService] Playback error:', {
      message: error.message,
      code: error.code,
    });
  });

  // Handle active track changes
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
    if (event.track) {
      console.log('[PlaybackService] Active track:', event.track.title);
    } else {
      console.log('[PlaybackService] No active track');
    }
  });

  // Handle queue end (shouldn't happen for live stream, indicates connection issue)
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, (event) => {
    console.log('[PlaybackService] Queue ended, position:', event.position);
    // For live streams, this usually means the stream disconnected
  });

  // Handle progress updates (useful for keeping service alive)
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
    // Silent progress tracking - keeps the service active
  });

  console.log('[PlaybackService] Service registered and ready for background playback');
}
