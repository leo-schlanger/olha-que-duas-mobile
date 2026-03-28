import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useMemo,
  useCallback,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { environment } from '../config/environment';
import { logger } from '../utils/logger';

const PREMIUM_STORAGE_KEY = '@olhaqueduas:premium';

// Type definition for dynamically loaded purchase service
interface PurchaseServiceType {
  initialize: () => Promise<void>;
  checkPurchaseStatus: () => Promise<boolean>;
  purchaseRemoveAds: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
}

// Lazy load purchase service only when native modules are available
let purchaseService: PurchaseServiceType | null = null;
if (environment.canUseNativeModules) {
  try {
    purchaseService = require('../services/purchaseService').purchaseService;
  } catch (_error) {
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
        // First, check local storage - this is fast and unblocks UI immediately
        const storedPremium = await AsyncStorage.getItem(PREMIUM_STORAGE_KEY);
        if (!mounted) return;

        if (storedPremium === 'true') {
          setIsPremium(true);
          setIsLoading(false); // Libera UI imediatamente se já é premium
        }

        // Then, verify with stores in background (only if native modules available)
        if (purchaseService && environment.features.purchases) {
          // Initialize the purchase service connection
          purchaseService
            .initialize()
            .then(() => {
              if (!mounted) return;
              return purchaseService.checkPurchaseStatus();
            })
            .then((hasValidPurchase) => {
              if (hasValidPurchase === undefined) return;
              if (!mounted) return;
              if (hasValidPurchase) {
                setIsPremium(true);
                AsyncStorage.setItem(PREMIUM_STORAGE_KEY, 'true');
              }
            })
            .catch((error: Error) => {
              logger.error('Error verifying purchases:', error);
            })
            .finally(() => {
              if (mounted) {
                setIsLoading(false);
              }
            });
        } else {
          // Se não há purchase service, libera loading
          if (mounted) {
            setIsLoading(false);
          }
        }
      } catch (error) {
        logger.error('Error loading premium status:', error);
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

  const purchasePremium = useCallback(async (): Promise<boolean> => {
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
  }, []);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
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
  }, []);

  // Memoizar o value do context para evitar re-renders desnecessários
  const contextValue = useMemo(
    () => ({
      isPremium,
      isLoading,
      purchasePremium,
      restorePurchases,
    }),
    [isPremium, isLoading, purchasePremium, restorePurchases]
  );

  return <PremiumContext.Provider value={contextValue}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumContextData {
  const context = useContext(PremiumContext);

  if (!context) {
    throw new Error('usePremium must be used within a PremiumProvider');
  }

  return context;
}
