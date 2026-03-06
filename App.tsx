import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { PremiumProvider } from "./src/context/PremiumContext";
import { GDPRConsent } from "./src/components/GDPRConsent";
import { environment } from "./src/config/environment";

// Lazy load all native services (not available in Expo Go)
let radioService: any = null;
let adService: any = null;
let purchaseService: any = null;

if (environment.canUseNativeModules) {
  try {
    radioService = require("./src/services/radioService").radioService;
    adService = require("./src/services/adService").adService;
    purchaseService = require("./src/services/purchaseService").purchaseService;
  } catch (error) {
    console.log("Native services not available");
  }
}

export default function App() {
  const [adsConsent, setAdsConsent] = useState<boolean | null>(null);

  useEffect(() => {
    // Initialize audio service for background playback
    radioService?.initialize();

    // Initialize native services only when available
    if (environment.canUseNativeModules) {
      purchaseService?.initialize();
    }

    return () => {
      // Cleanup when app is closed
      radioService?.stop();
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
    <SafeAreaProvider>
      <PremiumProvider>
        <StatusBar style="dark" />
        <AppNavigator />
        <GDPRConsent onConsentGiven={handleGDPRConsent} />
      </PremiumProvider>
    </SafeAreaProvider>
  );
}
