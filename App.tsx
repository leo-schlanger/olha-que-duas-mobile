import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { PremiumProvider } from "./src/context/PremiumContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { GDPRConsent } from "./src/components/GDPRConsent";
import { environment } from "./src/config/environment";

// Lazy load all native services (not available in Expo Go)
let radioService: any = null;
let radioSettingsService: any = null;
let adService: any = null;
let purchaseService: any = null;

if (environment.canUseNativeModules) {
  try {
    radioService = require("./src/services/radioService").radioService;
    radioSettingsService = require("./src/services/radioSettingsService").radioSettingsService;
    adService = require("./src/services/adService").adService;
    purchaseService = require("./src/services/purchaseService").purchaseService;
  } catch (error) {
    console.log("Native services not available");
  }
}

function AppContent() {
  const { isDark } = useTheme();
  const [adsConsent, setAdsConsent] = useState<boolean | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    async function initializeServices() {
      try {
        // Load radio settings first
        if (radioSettingsService) {
          await radioSettingsService.load();
          console.log("Radio settings loaded");
        }

        // Initialize audio service for background playback
        if (radioService) {
          await radioService.initialize();
          console.log("Radio service initialized");
        }

        // Initialize native services only when available
        if (environment.canUseNativeModules && purchaseService) {
          await purchaseService.initialize();
          console.log("Purchase service initialized");
        }

        setIsInitialized(true);
      } catch (error) {
        console.error("Error initializing services:", error);
        setIsInitialized(true); // Continue anyway
      }
    }

    initializeServices();

    return () => {
      // Cleanup when app is closed
      radioService?.cleanup();
      purchaseService?.disconnect();
    };
  }, []);

  // Initialize ads after consent is given
  useEffect(() => {
    if (adsConsent !== null && environment.canUseNativeModules && adService) {
      adService.initialize(adsConsent);
    }
  }, [adsConsent]);

  function handleGDPRConsent(personalizedAds: boolean) {
    setAdsConsent(personalizedAds);
    console.log('GDPR Consent:', personalizedAds ? 'Personalized' : 'Non-personalized');
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppNavigator />
      <GDPRConsent onConsentGiven={handleGDPRConsent} />
    </>
  );
}

export default function App() {
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
