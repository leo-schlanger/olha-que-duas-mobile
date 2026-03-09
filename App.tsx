import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { PremiumProvider } from "./src/context/PremiumContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { GDPRConsent } from "./src/components/GDPRConsent";
import { environment } from "./src/config/environment";
import { logger } from "./src/utils/logger";

// Services - expo-av works everywhere
import { radioService } from "./src/services/radioService";
import { radioSettingsService } from "./src/services/radioSettingsService";

import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";

// Lazy load native-only services
let adService: any = null;
let purchaseService: any = null;

if (environment.canUseNativeModules) {
  try {
    adService = require("./src/services/adService").adService;
    purchaseService = require("./src/services/purchaseService").purchaseService;
  } catch (error) {
    logger.log("Native services not available");
  }
}

function AppContent() {
  const { isDark } = useTheme();
  const [adsConsent, setAdsConsent] = useState<boolean | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    async function initializeServices() {
      try {
        await radioSettingsService.load();
        await radioService.initialize();
        logger.log("Radio service initialized");

        if (environment.canUseNativeModules && purchaseService) {
          await purchaseService.initialize();
        }

        setIsInitialized(true);
      } catch (error) {
        logger.error("Error initializing services:", error);
        setIsInitialized(true);
      }
    }

    initializeServices();

    return () => {
      radioService.cleanup();
      purchaseService?.disconnect();
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

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppNavigator />
      <GDPRConsent onConsentGiven={handleGDPRConsent} />
    </>
  );
}

function RootProviders() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  if (!fontsLoaded) {
    return null; // ou um splash simples
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <PremiumProvider>
          <AppContent />
        </PremiumProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return <RootProviders />;
}
