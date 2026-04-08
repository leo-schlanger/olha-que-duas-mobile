import React, { useEffect, useState, useRef, useCallback } from "react";
import { StatusBar } from "expo-status-bar";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppNavigator, navigateToTab } from "./src/navigation/AppNavigator";
import { PremiumProvider } from "./src/context/PremiumContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { NetworkProvider } from "./src/context/NetworkContext";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { GDPRConsent } from "./src/components/GDPRConsent";
import { AnimatedSplash } from "./src/components/AnimatedSplash";
import { environment } from "./src/config/environment";
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

// Services - expo-av works everywhere
import { radioService } from "./src/services/radioService";
import { radioSettingsService } from "./src/services/radioSettingsService";
import { notificationService } from "./src/services/notificationService";

// Lazy load native-only services
let adService: any = null;
let purchaseService: any = null;

const theme = {
  ...DefaultTheme,
  isV3: true as const,
};

if (environment.canUseNativeModules) {
  try {
    adService = require("./src/services/adService").adService;
    purchaseService = require("./src/services/purchaseService").purchaseService;
  } catch (error) {
    logger.log("Native services not available");
  }
}

type InitState = 'loading' | 'ready' | 'failed';

const INIT_TIMEOUT_MS = 8000;

function AppContent() {
  const { t } = useTranslation();
  const { isDark, colors } = useTheme();
  const [adsConsent, setAdsConsent] = useState<boolean | null>(null);
  const [initState, setInitState] = useState<InitState>('loading');
  const [splashDone, setSplashDone] = useState(false);

  // Ref to store notification response listener subscription
  const notificationResponseListener = useRef<Notifications.EventSubscription | null>(null);

  const initializeServices = useCallback(async () => {
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

        // Initialize notification service
        await notificationService.initialize();
        logger.log("Notification service initialized");

        if (environment.canUseNativeModules && purchaseService) {
          await purchaseService.initialize();
        }
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
    }
  }, []);

  useEffect(() => {
    initializeServices();

    // Handle notification taps - navigate to Radio tab when user taps a notification
    notificationResponseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        logger.log("Notification tapped:", response.notification.request.content.data);
        // Navigate to Radio tab when notification is tapped
        navigateToTab("Radio");
      }
    );

    return () => {
      // Clean up notification listener first (sync)
      if (notificationResponseListener.current) {
        notificationResponseListener.current.remove();
      }

      // Cleanup radio service (stops playback, removes lock screen, releases resources)
      radioService
        .cleanup()
        .catch((e) => logger.error('Error cleaning up radio:', e));

      purchaseService?.disconnect();
      notificationService.cleanup();
    };
  }, [initializeServices]);

  useEffect(() => {
    if (adsConsent !== null && environment.canUseNativeModules && adService) {
      adService.initialize(adsConsent);
    }
  }, [adsConsent]);

  function handleGDPRConsent(personalizedAds: boolean) {
    setAdsConsent(personalizedAds);
  }

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
      <GDPRConsent onConsentGiven={handleGDPRConsent} />
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
                name={props.name as any}
                size={props.size ?? 24}
                color={props.color}
              />
            ),
          }}
        >
          <NetworkProvider>
            <ThemeProvider>
              <PremiumProvider>
                <AppContent />
              </PremiumProvider>
            </ThemeProvider>
          </NetworkProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
