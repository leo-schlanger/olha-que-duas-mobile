import React, { useEffect, useState, useRef } from "react";
import { StatusBar } from "expo-status-bar";
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

function AppContent() {
  const { isDark } = useTheme();
  const [adsConsent, setAdsConsent] = useState<boolean | null>(null);
  const [initState, setInitState] = useState<InitState>('loading');
  const [splashDone, setSplashDone] = useState(false);

  // Ref to store notification response listener subscription
  const notificationResponseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    async function initializeServices() {
      try {
        // Load saved language preference
        await loadSavedLanguage();
        logger.log("Language loaded");

        await radioSettingsService.load();
        await radioService.initialize();
        logger.log("Radio service initialized");

        // Initialize notification service
        await notificationService.initialize();
        logger.log("Notification service initialized");

        if (environment.canUseNativeModules && purchaseService) {
          await purchaseService.initialize();
        }

        setInitState('ready');
      } catch (error) {
        logger.error("Error initializing services:", error);
        // Still allow app to render - some services may work
        setInitState('failed');
      }
    }

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

      // Stop radio explicitly first to remove notification, then cleanup
      radioService
        .stop()
        .catch((e) => logger.error('Error stopping radio:', e))
        .finally(() => {
          radioService.cleanup();
        });

      purchaseService?.disconnect();
      notificationService.cleanup();
    };
  }, []);

  useEffect(() => {
    if (adsConsent !== null && environment.canUseNativeModules && adService) {
      adService.initialize(adsConsent);
    }
  }, [adsConsent]);

  function handleGDPRConsent(personalizedAds: boolean) {
    setAdsConsent(personalizedAds);
  }

  const isInitialized = initState !== 'loading';

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      {splashDone ? null : (
        <AnimatedSplash
          isReady={isInitialized}
          onAnimationEnd={() => setSplashDone(true)}
        />
      )}
      <OfflineBanner />
      <AppNavigator />
      <GDPRConsent onConsentGiven={handleGDPRConsent} />
    </>
  );
}

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
