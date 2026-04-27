// Mock expo modules before anything else
jest.mock('expo', () => ({}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
}));

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly' },
}));

// Mock expo-audio
jest.mock('expo-audio', () => ({
  useAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
    playing: false,
    isBuffering: false,
    duration: 0,
    currentTime: 0,
  })),
  setAudioModeAsync: jest.fn(),
  AudioPlayer: jest.fn(),
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
    playing: false,
    isBuffering: false,
    volume: 1,
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
}));

// Mock ExpoMediaSession native module
jest.mock('../../modules/expo-media-session/src', () => ({
  activate: jest.fn(),
  updateMetadata: jest.fn(),
  updatePlaybackState: jest.fn(),
  deactivate: jest.fn(),
  addRemotePlayListener: jest.fn(() => ({ remove: jest.fn() })),
  addRemotePauseListener: jest.fn(() => ({ remove: jest.fn() })),
  addRemoteStopListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Mock expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({
      coords: { latitude: 40.0, longitude: -8.0 },
    })
  ),
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock supabase
jest.mock('../services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            range: jest.fn(() => Promise.resolve({ data: [], count: 0, error: null })),
          })),
          single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

// Mock constants
jest.mock('../config/constants', () => ({
  LIMITS: {
    POSTS_PER_PAGE: 10,
    MAX_RECONNECT_ATTEMPTS: 5,
  },
  STORAGE_KEYS: {
    NOTIFICATION_PREFS: 'notification_prefs',
    SCHEDULED_NOTIFICATIONS: 'scheduled_notifications',
    THEME: 'theme',
    PREMIUM: 'premium',
  },
}));

// Silence console warnings during tests
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.warn = (...args: unknown[]) => {
    const message = args[0];
    if (typeof message === 'string' && message.includes('Warning:')) return;
    originalWarn.apply(console, args);
  };
  console.error = (...args: unknown[]) => {
    const message = args[0];
    if (typeof message === 'string' && message.includes('Warning:')) return;
    originalError.apply(console, args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});
