/**
 * TECH DEBT: Premium status is stored as plaintext in AsyncStorage and
 * IAP purchases lack server-side receipt validation. For production
 * hardening, implement server-side validation to prevent local tampering.
 * AsyncStorage values should be treated as a local cache only.
 */
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
  onPurchaseDetected: (_listener: () => void) => () => void;
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
        }
        setIsLoading(false); // Libera UI imediatamente (a app é gratuita)

        // Initialize the store connection in the background. initialize()
        // consumes any outstanding `remove_ads` purchase (so the user can
        // donate again) and, for past donors, fires onPurchaseDetected which
        // lights up the "obrigado" state below. We no longer derive premium
        // from getAvailablePurchases — the donation is consumable, so it does
        // not persist as an entitlement.
        if (purchaseService && environment.features.purchases) {
          purchaseService.initialize().catch((error: Error) => {
            logger.error('Error initializing purchases:', error);
          });
        }
      } catch (error) {
        logger.error('Error loading premium status:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadPremiumStatus();

    // Listen for late or pending purchases delivered outside the explicit
    // purchase flow (e.g. Google Play resending a receipt after the 2-min
    // timeout in purchaseRemoveAds). Without this, a user who paid would
    // need to restart the app to see the premium state apply.
    let unsubscribe: (() => void) | null = null;
    if (purchaseService && environment.features.purchases) {
      unsubscribe = purchaseService.onPurchaseDetected(() => {
        if (!mounted) return;
        setIsPremium(true);
        AsyncStorage.setItem(PREMIUM_STORAGE_KEY, 'true').catch((err) =>
          logger.error('Error persisting premium after late purchase:', err)
        );
      });
    }

    return () => {
      mounted = false;
      unsubscribe?.();
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
