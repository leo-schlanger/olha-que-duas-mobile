import TrackPlayer, { Event } from 'react-native-track-player';

/**
 * Playback Service for react-native-track-player
 * This service runs in the background and handles remote events (lockscreen controls, etc.)
 */
export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.stop();
  });

  // Handle headphone/bluetooth disconnection
  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    if (event.paused) {
      // Another app took audio focus, pause
      await TrackPlayer.pause();
    } else if (event.permanent) {
      // Permanent loss of focus (e.g., phone call)
      await TrackPlayer.stop();
    } else {
      // Temporary loss (e.g., notification), resume
      await TrackPlayer.play();
    }
  });
}
