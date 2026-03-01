# Olha que Duas Mobile

A hybrid mobile app for Android and iOS built with Expo/React Native. Features live radio streaming with background audio support and news feed from Supabase.

## Features

- **Radio Player**: Live streaming with background audio support (works when device is locked)
- **News Feed**: Browse and read news articles from Supabase
- **Cross-platform**: Works on both Android and iOS

## Tech Stack

- **Framework**: Expo SDK 55 / React Native 0.83
- **Navigation**: React Navigation 7
- **Audio**: expo-av with background audio support
- **Database**: Supabase
- **Language**: TypeScript

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

The app uses `expo-av` configured for background audio playback:

- **iOS**: Configured with `UIBackgroundModes: ["audio"]` in app.json
- **Android**: Uses `FOREGROUND_SERVICE` permission for background playback

The radio continues playing when:
- The app is in the background
- The device screen is locked
- Other apps are in use

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
