import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { environment } from '../config/environment';
import { logger } from '../utils/logger';

const PREMIUM_STORAGE_KEY = '@olhaqueduas:premium';

// Lazy load purchase service only when native modules are available
let purchaseService: any = null;
if (environment.canUseNativeModules) {
  try {
    purchaseService = require('../services/purchaseService').purchaseService;
  } catch (error) {
    logger.log('Purchase service not available');
  }
}

interface PremiumContextData {
  isPremium: boolean;
  isLoading: boolean;
  purchasePremium: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
}

const PremiumContext = createContext<PremiumContextData>({} as PremiumContextData);

interface PremiumProviderProps {
  children: ReactNode;
}

export function PremiumProvider({ children }: PremiumProviderProps) {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadPremiumStatus() {
      try {
        // First, check local storage
        const storedPremium = await AsyncStorage.getItem(PREMIUM_STORAGE_KEY);
        if (!mounted) return;

        if (storedPremium === 'true') {
          setIsPremium(true);
        }

        // Then, verify with stores (only if native modules available)
        if (purchaseService && environment.features.purchases) {
          // Initialize the purchase service connection
          await purchaseService.initialize();
          if (!mounted) return;

          // Check if user has valid purchase
          const hasValidPurchase = await purchaseService.checkPurchaseStatus();
          if (!mounted) return;

          if (hasValidPurchase) {
            setIsPremium(true);
            await AsyncStorage.setItem(PREMIUM_STORAGE_KEY, 'true');
          }
        }
      } catch (error) {
        logger.error('Error loading premium status:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadPremiumStatus();

    return () => {
      mounted = false;
    };
  }, []);

  async function purchasePremium(): Promise<boolean> {
    try {
      if (!purchaseService || !environment.features.purchases) {
        logger.log('Purchases not available in this environment');
        return false;
      }

      setIsLoading(true);
      const success = await purchaseService.purchaseRemoveAds();

      if (success) {
        setIsPremium(true);
        await AsyncStorage.setItem(PREMIUM_STORAGE_KEY, 'true');
      }

      return success;
    } catch (error) {
      logger.error('Error purchasing premium:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function restorePurchases(): Promise<boolean> {
    try {
      if (!purchaseService || !environment.features.purchases) {
        logger.log('Purchases not available in this environment');
        return false;
      }

      setIsLoading(true);
      const success = await purchaseService.restorePurchases();

      if (success) {
        setIsPremium(true);
        await AsyncStorage.setItem(PREMIUM_STORAGE_KEY, 'true');
      }

      return success;
    } catch (error) {
      logger.error('Error restoring purchases:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <PremiumContext.Provider
      value={{
        isPremium,
        isLoading,
        purchasePremium,
        restorePurchases,
      }}
    >
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium(): PremiumContextData {
  const context = useContext(PremiumContext);

  if (!context) {
    throw new Error('usePremium must be used within a PremiumProvider');
  }

  return context;
}
