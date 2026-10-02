import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

interface ExpoMediaSessionModuleType {
  activate(title: string, artist: string, artworkUri: string): void;
  updateMetadata(title: string, artist: string, artworkUri: string): void;
  updatePlaybackState(isPlaying: boolean): void;
  startMetadataPolling(pollingUrl: string): void;
  stopMetadataPolling(): void;
  deactivate(): void;
  attachPlayer(player: object): Promise<boolean>;
  detachPlayer(): Promise<void>;
  sleep(ms: number): Promise<void>;
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  requestIgnoreBatteryOptimizations(): void;
  addListener(
    eventName: 'onRemotePlay' | 'onRemotePause' | 'onRemoteStop',
    listener: () => void
  ): EventSubscription;
  addListener(
    eventName: 'onStreamError',
    listener: (event: { code: string }) => void
  ): EventSubscription;
  addListener(
    eventName: 'onStreamTitle',
    listener: (event: { title: string }) => void
  ): EventSubscription;
}

export default requireNativeModule<ExpoMediaSessionModuleType>('ExpoMediaSession');
