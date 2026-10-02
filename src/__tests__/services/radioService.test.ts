import { createAudioPlayer } from 'expo-audio';
import * as ExpoMediaSession from '../../../modules/expo-media-session/src';
import { radioService } from '../../services/radioService';
import { nowPlayingService } from '../../services/nowPlayingService';

jest.mock('../../config/constants', () => jest.requireActual('../../config/constants'));
jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })), currentState: 'active' },
  Platform: { OS: 'android' },
}));
jest.mock('../../utils/artworkCache', () => ({ getLogoUri: (u: string) => u }));
jest.mock('../../services/nowPlayingService', () => ({
  nowPlayingService: { start: jest.fn(), stop: jest.fn(), onStreamTitle: jest.fn() },
}));
jest.mock('../../services/radioSettingsService', () => ({
  radioSettingsService: {
    load: jest.fn(() =>
      Promise.resolve({
        backgroundPlayback: true,
        autoPlayOnStart: false,
        autoReconnect: true,
        volume: 1,
        stopOnClose: false,
      })
    ),
    subscribe: jest.fn(() => () => {}),
    updateSetting: jest.fn(() => Promise.resolve()),
  },
}));

type StatusHandler = (status: Record<string, unknown>) => void;

interface FakePlayer {
  play: jest.Mock;
  pause: jest.Mock;
  release: jest.Mock;
  replace: jest.Mock;
  addListener: jest.Mock;
  playing: boolean;
  isBuffering: boolean;
  volume: number;
  emit: StatusHandler;
}

function makePlayer(): FakePlayer {
  const p: FakePlayer = {
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
    replace: jest.fn(),
    playing: false,
    isBuffering: false,
    volume: 1,
    emit: () => {},
    addListener: jest.fn((_event: string, handler: StatusHandler) => {
      p.emit = handler;
      return { remove: jest.fn() };
    }),
  };
  return p;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('radioService — live stream reliability', () => {
  let player: FakePlayer;
  let remotePlay: () => void;
  let streamTitle: (title: string) => void;
  let streamError: (code: string) => void;

  beforeAll(async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    (ExpoMediaSession.addRemotePlayListener as jest.Mock).mockImplementation((cb) => {
      remotePlay = cb;
      return { remove: jest.fn() };
    });
    (ExpoMediaSession.addStreamTitleListener as jest.Mock).mockImplementation((cb) => {
      streamTitle = cb;
      return { remove: jest.fn() };
    });
    (ExpoMediaSession.addStreamErrorListener as jest.Mock).mockImplementation((cb) => {
      streamError = cb;
      return { remove: jest.fn() };
    });
    player = makePlayer();
    (createAudioPlayer as jest.Mock).mockImplementation(() => player);
    await radioService.initialize();
    await radioService.play();
    player.emit({ playing: true, isBuffering: false });
  });

  afterAll(async () => {
    await radioService.cleanup();
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('attaches the native ICY listener to the new player and starts native metadata', () => {
    expect(radioService.getStatus().isPlaying).toBe(true);
  });

  it('forwards ICY titles to the now-playing service', () => {
    streamTitle('O Boticário - Anúncios - Floratta Rose Bouquet');
    expect(nowPlayingService.onStreamTitle).toHaveBeenCalledWith(
      'O Boticário - Anúncios - Floratta Rose Bouquet'
    );
  });

  it('reconnects (re-opening the stream) when the server ends the stream', async () => {
    player.emit({
      playing: false,
      isBuffering: false,
      didJustFinish: true,
      playbackState: 'ended',
    });
    // The back-off waits on the native timer, not on setTimeout.
    expect(ExpoMediaSession.sleep).toHaveBeenCalledTimes(1);
    await flush();
    expect(player.replace).toHaveBeenCalledWith(
      expect.objectContaining({ uri: expect.stringContaining('radio.mp3') })
    );
    expect(player.play).toHaveBeenCalled();
    player.emit({ playing: true, isBuffering: false });
    expect(radioService.getStatus().isPlaying).toBe(true);
    expect(radioService.getStatus().reconnectAttempt).toBe(0);
  });

  it('reconnects when the connection fails (player goes idle, no error field)', async () => {
    jest.advanceTimersByTime(2000);
    player.emit({ playing: false, isBuffering: false, playbackState: 'idle' });
    expect(radioService.getStatus().isPlaying).toBe(false);
    expect(ExpoMediaSession.sleep).toHaveBeenCalledTimes(1);
    // The native error event for the same failure doesn't schedule a 2nd one.
    streamError('ERROR_CODE_IO_NETWORK_CONNECTION_FAILED');
    expect(ExpoMediaSession.sleep).toHaveBeenCalledTimes(1);
    await flush();
    expect(player.replace).toHaveBeenCalledTimes(1);
    player.emit({ playing: true, isBuffering: false });
    expect(radioService.getStatus().isPlaying).toBe(true);
  });

  it('reconnects on the native stream error event', async () => {
    jest.advanceTimersByTime(2000);
    streamError('ERROR_CODE_IO_NETWORK_CONNECTION_FAILED');
    expect(ExpoMediaSession.sleep).toHaveBeenCalledTimes(1);
    await flush();
    expect(player.replace).toHaveBeenCalledTimes(1);
    player.emit({ playing: true, isBuffering: false });
  });

  it('re-opens the live stream on resume instead of replaying the stale buffer', async () => {
    await radioService.pause();
    expect(player.pause).toHaveBeenCalled();
    await radioService.play();
    expect(player.replace).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
    player.emit({ playing: true, isBuffering: false });
  });

  it('a system pause (focus loss) is reflected and the notification Play restarts the radio', async () => {
    jest.advanceTimersByTime(1000);
    player.emit({ playing: false, isBuffering: false });
    expect(radioService.getStatus().isPlaying).toBe(false);
    expect(ExpoMediaSession.updatePlaybackState).toHaveBeenLastCalledWith(false);

    remotePlay();
    await flush();
    expect(player.replace).toHaveBeenCalled();
    expect(player.play).toHaveBeenCalled();
  });

  it('a pending reconnect is cancelled by a user pause', async () => {
    let wake: () => void = () => {};
    (ExpoMediaSession.sleep as jest.Mock).mockImplementationOnce(
      () => new Promise<void>((resolve) => (wake = resolve))
    );
    player.emit({ playing: true, isBuffering: false });
    player.emit({ error: 'Source error' });
    await radioService.pause();
    player.replace.mockClear();
    wake();
    await flush();
    expect(player.replace).not.toHaveBeenCalled();
  });
});
