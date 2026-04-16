# Olha que Duas Mobile

A hybrid mobile app for Android and iOS built with Expo/React Native. Features live radio streaming with background audio support, weather, news, and program reminders.

## Features

- **Radio Player**: Live streaming with lock-screen / media-notification controls. Plays in the background by default; auto-reconnects on transient network drops.
- **Now Playing in real time**: Server-Sent Events from AzuraCast deliver track / show changes in <200ms; album art is pre-cached so the lock screen updates without download delay.
- **Keep Screen Awake**: Toggle next to play to prevent the screen from sleeping while listening.
- **Program Reminders**: Per-show bell to schedule a notification before the program starts; manage all reminders from the schedule header or Settings.
- **Weather**: Current conditions and 7-day forecast for the device location (falls back to Lisbon if permission denied).
- **News Feed**: Articles from the Supabase backend, with deep linking from `olhaqueduas.com/noticias/...`.
- **Light / Dark Themes**: Warm beige light theme and contrast-tuned dark theme; follows system or user preference.
- **Internationalisation**: Portuguese (default) and English with runtime switching.
- **Premium IAP**: Optional one-time purchase to remove ads.
- **Cross-platform**: Android and iOS.

## Tech Stack

- **Framework**: Expo SDK 54 / React Native 0.81
- **Navigation**: React Navigation 6
- **Audio**: expo-audio with background playback + media-session controls
- **Now Playing**: react-native-sse (Server-Sent Events) with polling fallback
- **Database**: Supabase
- **Notifications**: expo-notifications (exact alarms via `setExactAndAllowWhileIdle`)
- **Ads**: react-native-google-mobile-ads (banner + interstitial)
- **In-App Purchases**: react-native-iap
- **Language**: TypeScript (strict)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)

### Installation

1. Clone the repository:
```bash
cd olha-que-duas-mobile
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:
```
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

4. Start the development server:
```bash
npm start
```

### Running on Devices

```bash
# Android
npm run android

# iOS (macOS only)
npm run ios
```

## Project Structure

```
src/
├── components/       # Reusable UI components
│   ├── RadioPlayer.tsx
│   └── NewsCard.tsx
├── screens/          # App screens
│   ├── RadioScreen.tsx
│   ├── NewsScreen.tsx
│   └── NewsDetailScreen.tsx
├── navigation/       # Navigation configuration
│   └── AppNavigator.tsx
├── hooks/            # Custom React hooks
│   ├── useRadio.ts
│   └── useNews.ts
├── services/         # API and service classes
│   ├── radioService.ts
│   ├── newsApi.ts
│   └── supabase.ts
├── config/           # App configuration
│   └── site.ts
└── types/            # TypeScript type definitions
    └── blog.ts
```

## Background Audio

The app uses `expo-audio` (not the legacy `expo-av`) with a foreground media service:

- **iOS**: `UIBackgroundModes: ["audio", "fetch", "remote-notification"]` in app.json.
- **Android**: `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permissions; the `withStopAudioOnTaskRemoved` config plugin makes the service stop cleanly when the user swipes the app away from recents.

The radio continues playing when:
- The app is in the background (Home pressed, screen locked, other app on top).
- The user can pause / resume from the lock screen and notification shade.
- The artwork shown on the lock screen updates without download delay — covers are pre-fetched to local files via `expo-file-system` and passed as `file://` URIs.

## Building for Production

### Using EAS Build

1. Install EAS CLI:
```bash
npm install -g eas-cli
```

2. Configure EAS:
```bash
eas build:configure
```

3. Build for Android:
```bash
eas build -p android
```

4. Build for iOS:
```bash
eas build -p ios
```

## License

Private - All rights reserved.
