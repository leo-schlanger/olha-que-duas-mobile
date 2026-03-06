import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';

import App from './App';

// Register playback service only in native builds (not in Expo Go)
const isExpoGo = Constants.appOwnership === 'expo';
if (!isExpoGo) {
    try {
        const TrackPlayer = require('react-native-track-player').default;
        const { PlaybackService } = require('./src/services/playbackService');
        TrackPlayer.registerPlaybackService(() => PlaybackService);
    } catch (error) {
        console.log('TrackPlayer not available in this environment');
    }
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
