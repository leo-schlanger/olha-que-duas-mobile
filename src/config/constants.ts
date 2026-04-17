/**
 * Constantes centralizadas do aplicativo
 * Evita magic numbers espalhados pelo código
 */

// Timeouts e intervalos (em milissegundos)
export const TIMING = {
  // Radio
  // Polling interval for player status. Cada poll lê player.playing +
  // player.isBuffering via bridge JS↔native. Com NewArch (SDK 55) o
  // overhead por call é menor mas queremos minimizar para reduzir
  // contention durante streaming. 3s é suficiente para detectar
  // play/pause do lock screen (o playbackStatusUpdate event-driven
  // cobre os casos urgentes).
  RADIO_STATUS_POLL_INTERVAL: 5000,
  RADIO_AUTOPLAY_DELAY: 500,
  RADIO_LOCK_SCREEN_DELAY: 200,
  RADIO_MAX_RECONNECT_DELAY: 30000,
  RADIO_RECONNECT_BASE_DELAY: 1000,
  // Tempo máximo em buffering antes de considerar o stream "stalled" e
  // accionar reconnect automático. 12s dá margem em redes 3G/lentas mas
  // impede o utilizador de ficar preso num spinner para sempre.
  RADIO_STALL_TIMEOUT: 12000,

  // Now Playing
  // 3s gives a snappier "the song just changed" feel without thrashing the
  // AzuraCast endpoint. Background polling stays at 3x this in service code.
  NOW_PLAYING_POLL_INTERVAL: 3000,
  NOW_PLAYING_TRANSITION_DURATION: 350,

  // Purchases
  PURCHASE_TIMEOUT: 120000, // 2 minutos

  // Ads
  AD_SDK_CHECK_INTERVAL: 500,
  AD_SDK_INIT_TIMEOUT: 5000,
  AD_BANNER_TIMEOUT: 10000,
  AD_INTERSTITIAL_WAIT_SECONDS: 5,

  // Network
  FETCH_TIMEOUT: 15000, // 15 segundos

  // Animations
  VISUALIZER_INTERVAL: 150,
  VISUALIZER_ANIMATION_DURATION: 150,
  VISUALIZER_RESET_DURATION: 300,
} as const;

// Limites e quantidades
export const LIMITS = {
  // Paginação
  POSTS_PER_PAGE: 10,

  // Radio
  MAX_RECONNECT_ATTEMPTS: 10,

  // Now Playing
  MIN_SONG_DURATION_SECONDS: 60,

  // Visualizer
  VISUALIZER_BAR_COUNT: 12,
  VISUALIZER_MIN_HEIGHT: 5,
  VISUALIZER_MAX_HEIGHT: 25,
} as const;

// Padrões de notificação
export const NOTIFICATION = {
  VIBRATION_PATTERN: [0, 250, 250, 250],
  CHANNEL_ID: 'program-reminders',
  REMINDER_OPTIONS: [5, 15, 30, 60] as const,
} as const;

// Chaves de armazenamento AsyncStorage
export const STORAGE_KEYS = {
  THEME_PREFERENCE: '@olhaqueduas:theme_preference',
  NOTIFICATION_PREFS: '@olhaqueduas:notification_prefs',
  SCHEDULED_NOTIFICATIONS: '@olhaqueduas:scheduled_notifications',
  RADIO_SETTINGS: '@olhaqueduas:radio_settings',
  PREMIUM_STATUS: '@olhaqueduas:premium',
  GDPR_CONSENT: '@olhaqueduas:gdpr_consent',
} as const;

// Fallback de localização (Lisboa)
export const DEFAULT_LOCATION = {
  latitude: 38.7223,
  longitude: -9.1393,
  city: 'Lisboa',
} as const;
