/**
 * Purchase Service - In-App Purchases
 *
 * Handles Google Play Store purchases. Desde a v1.18.0 a compra é um
 * contributo voluntário ("Apoiar o projeto") — não desbloqueia nada.
 *
 * Usa `react-native-iap` v15 (API Nitro: initConnection, fetchProducts,
 * requestPurchase, purchaseUpdatedListener, finishTransaction). O SKU
 * `remove_ads` é mantido por corresponder ao produto já existente na Play
 * Console (renomear quebraria compras existentes).
 *
 * IMPORTANTE (v15 / Nitro): o objeto Purchase do Android NÃO tem
 * `transactionId` fiável (é opcional e quase sempre `null`). A prova de
 * compra válida é `purchaseState === 'purchased'`; o token para finalizar é
 * `purchaseToken`. Tratamos o donativo como CONSUMÍVEL para que o utilizador
 * possa apoiar o projeto mais do que uma vez.
 */

import { Platform } from 'react-native';
import { logger } from '../utils/logger';
import { environment } from '../config/environment';

// Product ID for the donation (must match Play Console)
const REMOVE_ADS_SKU = 'remove_ads';

// All product SKUs
const PRODUCT_SKUS = Platform.select({
  android: [REMOVE_ADS_SKU],
  ios: [REMOVE_ADS_SKU],
}) as string[];

// Subscription type — react-native-iap listeners return { remove() }
type PurchaseSubscription = { remove: () => void };

// Generic product type (subset of react-native-iap v15 Product we use)
type IAP_Product = {
  productId?: string;
  id?: string;
  title?: string;
  description?: string;
  /** v15 cross-platform formatted price, e.g. "3,69 €" */
  displayPrice?: string;
  currency?: string;
  oneTimePurchaseOfferDetailsAndroid?: Array<{ formattedPrice?: string }> | null;
};

// Purchase shape (subset of react-native-iap v15 Purchase we use)
type IAP_Purchase = {
  id?: string;
  productId?: string;
  /** 'pending' | 'purchased' | 'unknown' */
  purchaseState?: string;
  purchaseToken?: string | null;
};

// IAP module interface (subset of react-native-iap we actually use)
interface IAPModule {
  initConnection: () => Promise<boolean>;
  endConnection: () => Promise<boolean>;
  getAvailablePurchases: () => Promise<IAP_Purchase[]>;
  fetchProducts: (params: { skus: string[]; type?: string }) => Promise<IAP_Product[]>;
  requestPurchase: (params: { request: unknown; type?: string }) => Promise<unknown>;
  finishTransaction: (params: { purchase: unknown; isConsumable: boolean }) => Promise<void>;
  purchaseUpdatedListener: (callback: (purchase: IAP_Purchase) => void) => PurchaseSubscription;
  purchaseErrorListener: (callback: (error: unknown) => void) => PurchaseSubscription;
}

// Lazy-loaded IAP module
let iapModule: IAPModule | null = null;

/**
 * Get the IAP module, loading it dynamically if needed
 */
function getIAPModule(): IAPModule | null {
  if (!environment.canUseNativeModules) {
    return null;
  }

  if (iapModule === null) {
    try {
      iapModule = require('react-native-iap') as IAPModule;
    } catch (error) {
      logger.error('PurchaseService: Failed to load react-native-iap:', error);
      return null;
    }
  }

  return iapModule;
}

class PurchaseService {
  private isConnected = false;
  private products: IAP_Product[] = [];
  private purchaseUpdateSubscription: PurchaseSubscription | null = null;
  private purchaseErrorSubscription: PurchaseSubscription | null = null;
  private onPurchaseComplete: ((_success: boolean) => void) | null = null;
  private isPurchaseInProgress = false;
  // Long-lived observer used by PremiumContext. Unlike onPurchaseComplete
  // (a transient one-shot for the active flow), this is invoked for *every*
  // valid purchase the store delivers — including late deliveries that
  // arrive after a timeout, and previously-owned purchases consumed on app
  // launch. Lets the "obrigado" state converge without an app restart.
  private purchaseDetectedListeners: Set<() => void> = new Set();

  /**
   * Initialize connection with the store (Google Play / App Store)
   */
  async initialize(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const iap = getIAPModule();
    if (!iap) {
      logger.log('PurchaseService: IAP not available (Expo Go?)');
      return;
    }

    try {
      const result = await iap.initConnection();
      logger.log('PurchaseService: Connection result:', result);
      this.isConnected = true;

      // Setup purchase listeners
      this.setupListeners();

      // Load products
      await this.loadProducts();

      // Consume any leftover/owned `remove_ads` purchases so the user can
      // donate again. This also acknowledges purchases that completed while
      // the app was closed (otherwise Google auto-refunds them after 3 days).
      await this.consumeOutstandingPurchases();

      logger.log('PurchaseService: Initialized successfully');
    } catch (error) {
      logger.error('PurchaseService: Initialization error:', error);
      this.isConnected = false;
    }
  }

  /**
   * Setup purchase update and error listeners
   */
  private setupListeners(): void {
    const iap = getIAPModule();
    if (!iap) return;

    // Listen for purchase updates
    this.purchaseUpdateSubscription = iap.purchaseUpdatedListener(async (purchase) => {
      logger.log(
        'PurchaseService: Purchase updated:',
        purchase?.productId,
        purchase?.purchaseState
      );

      // Ignore unrelated products (defensive — we only sell remove_ads).
      if (purchase?.productId && purchase.productId !== REMOVE_ADS_SKU) return;

      // Only act on completed purchases. 'pending' = awaiting payment (e.g.
      // slow card, cash payment) — do NOT finish/consume those yet.
      if (purchase?.purchaseState !== 'purchased') {
        logger.log('PurchaseService: purchase not completed yet:', purchase?.purchaseState);
        return;
      }

      try {
        // Consumable: consuming makes the product purchasable again so the
        // user can donate multiple times.
        await iap.finishTransaction({ purchase, isConsumable: true });
        logger.log('PurchaseService: Transaction consumed');
      } catch (error) {
        // Payment already succeeded; if the consume fails it stays "owned"
        // and will be consumed on the next initialize(). Still report success.
        logger.error('PurchaseService: Error finishing transaction:', error);
      }

      // Notify the in-flight UI flow (one-shot) — may be null if the
      // purchase arrives after the timeout in purchaseRemoveAds().
      if (this.onPurchaseComplete) {
        this.onPurchaseComplete(true);
        this.onPurchaseComplete = null;
      }

      // Always notify long-lived observers so the "obrigado" state converges.
      this.notifyPurchaseDetected();
    });

    // Listen for purchase errors
    this.purchaseErrorSubscription = iap.purchaseErrorListener((error) => {
      logger.error('PurchaseService: Purchase error:', error);

      // Notify failure
      if (this.onPurchaseComplete) {
        this.onPurchaseComplete(false);
        this.onPurchaseComplete = null;
      }
    });
  }

  /**
   * Load available products from the store
   */
  private async loadProducts(): Promise<void> {
    const iap = getIAPModule();
    if (!iap) return;

    try {
      const products = await iap.fetchProducts({ skus: PRODUCT_SKUS, type: 'in-app' });
      this.products = (products ?? []) as IAP_Product[];
      logger.log('PurchaseService: Products loaded:', this.products.length);
    } catch (error) {
      logger.error('PurchaseService: Error loading products:', error);
    }
  }

  /**
   * Consume every outstanding `remove_ads` purchase. Frees the product up for
   * re-purchase (donate again) and acknowledges purchases delivered while the
   * app was closed. Safe to call repeatedly — no-op when nothing is owned.
   */
  private async consumeOutstandingPurchases(): Promise<void> {
    const iap = getIAPModule();
    if (!iap) return;

    try {
      const purchases = await iap.getAvailablePurchases();
      const owned = purchases.filter(
        (p) => p.productId === REMOVE_ADS_SKU && p.purchaseState === 'purchased'
      );
      if (owned.length === 0) return;

      logger.log('PurchaseService: Consuming outstanding purchases:', owned.length);
      for (const purchase of owned) {
        try {
          await iap.finishTransaction({ purchase, isConsumable: true });
          // A past donation existed — let the "obrigado" state light up.
          this.notifyPurchaseDetected();
        } catch (error) {
          logger.error('PurchaseService: Error consuming outstanding purchase:', error);
        }
      }
    } catch (error) {
      logger.error('PurchaseService: Error querying available purchases:', error);
    }
  }

  /**
   * Disconnect from the store
   */
  async disconnect(): Promise<void> {
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
      this.purchaseUpdateSubscription = null;
    }

    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
      this.purchaseErrorSubscription = null;
    }

    if (this.isConnected) {
      const iap = getIAPModule();
      if (iap) {
        try {
          await iap.endConnection();
        } catch (error) {
          logger.error('PurchaseService: Error disconnecting:', error);
        }
      }
    }

    this.isConnected = false;
  }

  /**
   * Get the donation product information
   */
  async getRemoveAdsProduct(): Promise<IAP_Product | null> {
    if (!this.isConnected) {
      await this.initialize();
    }

    const product = this.products.find(
      (p) => p.productId === REMOVE_ADS_SKU || p.id === REMOVE_ADS_SKU
    );
    return product || null;
  }

  /**
   * Start the donation purchase flow
   */
  async purchaseRemoveAds(): Promise<boolean> {
    const iap = getIAPModule();
    if (!iap) {
      logger.log('PurchaseService: IAP not available');
      return false;
    }

    // Prevent multiple simultaneous purchases
    if (this.isPurchaseInProgress) {
      logger.log('PurchaseService: Purchase already in progress');
      return false;
    }

    if (!this.isConnected) {
      await this.initialize();
    }

    this.isPurchaseInProgress = true;

    return new Promise<boolean>((resolve) => {
      // Timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        logger.log('PurchaseService: Purchase timeout');
        this.onPurchaseComplete = null;
        this.isPurchaseInProgress = false;
        resolve(false);
      }, 120000);

      // Set callback for when purchase completes (delivered via listener)
      this.onPurchaseComplete = (success: boolean) => {
        clearTimeout(timeoutId);
        this.isPurchaseInProgress = false;
        resolve(success);
      };

      // Request the purchase using the v15 API format
      const purchaseRequest =
        Platform.OS === 'android'
          ? { google: { skus: [REMOVE_ADS_SKU] } }
          : { apple: { sku: REMOVE_ADS_SKU } };

      iap
        .requestPurchase({
          request: purchaseRequest,
          type: 'in-app',
        })
        .catch((error) => {
          logger.error('PurchaseService: Error requesting purchase:', error);
          clearTimeout(timeoutId);
          this.onPurchaseComplete = null;
          this.isPurchaseInProgress = false;
          resolve(false);
        });

      // Note: The actual result comes through the listener
    });
  }

  /**
   * Whether the user currently has an unconsumed `remove_ads` purchase.
   * With a consumable donation this is normally false right after init
   * (we consume on launch), so callers should not treat it as a permanent
   * entitlement — it exists only to detect a purchase stuck mid-flow.
   */
  async checkPurchaseStatus(): Promise<boolean> {
    const iap = getIAPModule();
    if (!iap) return false;

    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      const purchases = await iap.getAvailablePurchases();
      return purchases.some(
        (purchase) =>
          purchase.productId === REMOVE_ADS_SKU && purchase.purchaseState === 'purchased'
      );
    } catch (error) {
      logger.error('PurchaseService: Error checking purchase status:', error);
      return false;
    }
  }

  /**
   * Re-check and consume any outstanding purchase. Kept for API compatibility
   * with PremiumContext; with a consumable donation there is nothing to
   * "restore" in the classic sense.
   */
  async restorePurchases(): Promise<boolean> {
    const had = await this.checkPurchaseStatus();
    await this.consumeOutstandingPurchases();
    return had;
  }

  /**
   * Subscribe to long-lived "any valid purchase detected" notifications.
   * Returns an unsubscribe function.
   */
  onPurchaseDetected(listener: () => void): () => void {
    this.purchaseDetectedListeners.add(listener);
    return () => {
      this.purchaseDetectedListeners.delete(listener);
    };
  }

  private notifyPurchaseDetected(): void {
    this.purchaseDetectedListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        logger.error('PurchaseService: purchase-detected listener threw:', error);
      }
    });
  }

  /**
   * Get the formatted price of the donation product
   */
  async getFormattedPrice(): Promise<string> {
    const product = await this.getRemoveAdsProduct();

    if (product) {
      // v15 cross-platform formatted price
      if (product.displayPrice) {
        return product.displayPrice;
      }
      // Android one-time purchase offer fallback
      const androidPrice = product.oneTimePurchaseOfferDetailsAndroid?.[0]?.formattedPrice;
      if (androidPrice) {
        return androidPrice;
      }
    }

    return '3,69 €';
  }
}

export const purchaseService = new PurchaseService();
