import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

interface ExpoMediaSessionModuleType {
  activate(title: string, artist: string, artworkUri: string): void;
  updateMetadata(title: string, artist: string, artworkUri: string): void;
  updatePlaybackState(isPlaying: boolean): void;
  startMetadataPolling(pollingUrl: string): void;
  stopMetadataPolling(): void;
  deactivate(): void;
  addListener(
    eventName: 'onRemotePlay' | 'onRemotePause' | 'onRemoteStop',
    listener: () => void
  ): EventSubscription;
}

export default requireNativeModule<ExpoMediaSessionModuleType>('ExpoMediaSession');
