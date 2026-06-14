import React, { useEffect, useState, useRef, useCallback } from "react";
import { StatusBar } from "expo-status-bar";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppNavigator, navigateToTab } from "./src/navigation/AppNavigator";
import { ToastProvider } from "./src/context/ToastContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { NetworkProvider } from "./src/context/NetworkContext";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { AnimatedSplash } from "./src/components/AnimatedSplash";
import { logger } from "./src/utils/logger";
import * as Notifications from "expo-notifications";

// i18n initialization
import "./src/i18n";
import { loadSavedLanguage } from "./src/i18n";
import { useTranslation } from "react-i18next";

import {
  Provider as PaperProvider,
  DefaultTheme,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

// Services
import { radioService } from "./src/services/radioService";
import { radioSettingsService } from "./src/services/radioSettingsService";
import { notificationService } from "./src/services/notificationService";
import { prefetchLogo } from "./src/utils/artworkCache";
import { siteConfig } from "./src/config/site";

const theme = {
  ...DefaultTheme,
  isV3: true as const,
};

type InitState = 'loading' | 'ready' | 'failed';

const INIT_TIMEOUT_MS = 8000;

function AppContent() {
  const { t } = useTranslation();
  const { isDark, colors } = useTheme();
  const [initState, setInitState] = useState<InitState>('loading');
  const [splashDone, setSplashDone] = useState(false);

  // Ref to store notification response listener subscription
  const notificationResponseListener = useRef<Notifications.EventSubscription | null>(null);
  // Guard against concurrent initializeServices() calls — the retry button
  // (and React StrictMode in dev) can otherwise fire two parallel runs that
  // both flip initState and race to initialise the same singletons.
  const initInFlightRef = useRef(false);

  const initializeServices = useCallback(async () => {
    if (initInFlightRef.current) {
      logger.log("Init already in progress, ignoring");
      return;
    }
    initInFlightRef.current = true;

    try {
      setInitState('loading');

      const initPromise = (async () => {
        // Load saved language preference
        await loadSavedLanguage();
        logger.log("Language loaded");

        // Load settings first, then pass to radioService to avoid double-load
        const settings = await radioSettingsService.load();
        await radioService.initialize(settings);
        logger.log("Radio service initialized");

        // Pre-cache the radio logo to a local file so the media
        // notification always has a file:// URI for artwork. Fire and
        // forget; if it fails, the notification shows without artwork.
        prefetchLogo(siteConfig.radio.logoUrl).catch((err) =>
          logger.warn("Logo prefetch failed:", err)
        );

        // Initialize notification service
        await notificationService.initialize();
        logger.log("Notification service initialized");
      })();

      // Race against timeout to prevent infinite splash
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Init timeout')), INIT_TIMEOUT_MS)
      );

      await Promise.race([initPromise, timeoutPromise]);
      setInitState('ready');
    } catch (error) {
      logger.error("Error initializing services:", error);
      // Still allow app to render - some services may work
      setInitState('failed');
    } finally {
      initInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    initializeServices();

    // Helper that decides whether a tapped notification should navigate to Radio.
    // Only program-reminder notifications navigate; future notification types can opt out.
    const handleNotificationTap = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as
        | { type?: string }
        | null
        | undefined;
      logger.log("Notification tapped:", data);
      if (data?.type === 'program-reminder' || data?.type === undefined) {
        // Defer until the navigator is mounted — cold-start tap arrives before mount
        const tryNavigate = () => navigateToTab("Radio");
        tryNavigate();
        // Retry once after a short delay in case the navigator wasn't ready yet
        setTimeout(tryNavigate, 500);
      }
    };

    // Handle taps that happen while the app is already running
    notificationResponseListener.current = Notifications.addNotificationResponseReceivedListener(
      handleNotificationTap
    );

    // Handle taps that launched the app from a killed state
    Notifications.getLastNotificationResponseAsync()
      .then(handleNotificationTap)
      .catch((err) => logger.error('Error reading initial notification response:', err));

    return () => {
      // Clean up notification listener first (sync)
      if (notificationResponseListener.current) {
        notificationResponseListener.current.remove();
      }

      // Cleanup radio service (stops playback, removes lock screen, releases resources)
      radioService
        .cleanup()
        .catch((e) => logger.error('Error cleaning up radio:', e));

      notificationService.cleanup();
    };
  }, [initializeServices]);

  const isInitialized = initState !== 'loading';
  const initFailed = initState === 'failed';

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      {splashDone ? null : (
        <AnimatedSplash
          isReady={isInitialized}
          onAnimationEnd={() => setSplashDone(true)}
        />
      )}
      {splashDone && initFailed && (
        <View style={[initErrorStyles.banner, { backgroundColor: colors.backgroundCard }]}>
          <Text style={[initErrorStyles.text, { color: colors.textSecondary }]}>
            {t('common.initError')}
          </Text>
          <TouchableOpacity
            onPress={initializeServices}
            style={[initErrorStyles.retryButton, { backgroundColor: colors.secondary }]}
          >
            <Text style={initErrorStyles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <OfflineBanner />
      <AppNavigator />
    </>
  );
}

const initErrorStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
  },
  text: { fontSize: 13 },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <PaperProvider
          theme={theme}
          settings={{
            icon: (props) => (
              <MaterialCommunityIcons
                name={props.name as keyof typeof MaterialCommunityIcons.glyphMap}
                size={props.size ?? 24}
                color={props.color}
              />
            ),
          }}
        >
          <NetworkProvider>
            <ThemeProvider>
              <ToastProvider>
                <AppContent />
              </ToastProvider>
            </ThemeProvider>
          </NetworkProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
