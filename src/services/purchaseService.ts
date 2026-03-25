/**
 * Purchase Service - In-App Purchases
 *
 * Handles Google Play Store purchases for removing ads
 * Compatible with react-native-iap v14+
 */

import { Platform } from 'react-native';
import { logger } from '../utils/logger';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getAvailablePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type Purchase,
  type PurchaseError,
} from 'react-native-iap';

// Product ID for removing ads (must match Play Console)
const REMOVE_ADS_SKU = 'remove_ads';

// All product SKUs
const PRODUCT_SKUS = Platform.select({
  android: [REMOVE_ADS_SKU],
  ios: [REMOVE_ADS_SKU],
}) as string[];

// Subscription type from react-native-iap
type PurchaseSubscription = { remove: () => void };

// Generic product type for cross-platform compatibility
type IAP_Product = {
  productId?: string;
  title?: string;
  description?: string;
  price?: string;
  localizedPrice?: string;
  currency?: string;
  oneTimePurchaseOfferDetails?: {
    formattedPrice?: string;
    priceAmountMicros?: string;
    priceCurrencyCode?: string;
  };
};

class PurchaseService {
  private isConnected = false;
  private products: IAP_Product[] = [];
  private purchaseUpdateSubscription: PurchaseSubscription | null = null;
  private purchaseErrorSubscription: PurchaseSubscription | null = null;
  private onPurchaseComplete: ((success: boolean) => void) | null = null;
  private isPurchaseInProgress = false; // Previne múltiplas compras simultâneas

  /**
   * Initialize connection with the store (Google Play / App Store)
   */
  async initialize(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      const result = await initConnection();
      logger.log('PurchaseService: Connection result:', result);
      this.isConnected = true;

      // Setup purchase listeners
      this.setupListeners();

      // Load products
      await this.loadProducts();

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
    // Listen for purchase updates
    this.purchaseUpdateSubscription = purchaseUpdatedListener(
      async (purchase: Purchase) => {
        logger.log('PurchaseService: Purchase updated:', purchase);

        // Check if purchase has a transaction ID (indicates valid purchase)
        const transactionId = purchase.transactionId;
        if (transactionId) {
          try {
            // Acknowledge the purchase (required for Google Play)
            await finishTransaction({ purchase, isConsumable: false });
            logger.log('PurchaseService: Transaction finished');

            // Notify success
            if (this.onPurchaseComplete) {
              this.onPurchaseComplete(true);
              this.onPurchaseComplete = null;
            }
          } catch (error) {
            logger.error('PurchaseService: Error finishing transaction:', error);
          }
        }
      }
    );

    // Listen for purchase errors
    this.purchaseErrorSubscription = purchaseErrorListener(
      (error: PurchaseError) => {
        logger.error('PurchaseService: Purchase error:', error);

        // Notify failure
        if (this.onPurchaseComplete) {
          this.onPurchaseComplete(false);
          this.onPurchaseComplete = null;
        }
      }
    );
  }

  /**
   * Load available products from the store
   */
  private async loadProducts(): Promise<void> {
    try {
      const products = await fetchProducts({ skus: PRODUCT_SKUS });
      this.products = (products ?? []) as unknown as IAP_Product[];
      logger.log('PurchaseService: Products loaded:', this.products.length);
    } catch (error) {
      logger.error('PurchaseService: Error loading products:', error);
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
      try {
        await endConnection();
      } catch (error) {
        logger.error('PurchaseService: Error disconnecting:', error);
      }
    }

    this.isConnected = false;
  }

  /**
   * Get remove ads product information
   */
  async getRemoveAdsProduct(): Promise<IAP_Product | null> {
    if (!this.isConnected) {
      await this.initialize();
    }

    const product = this.products.find((p) => p.productId === REMOVE_ADS_SKU);
    return product || null;
  }

  /**
   * Start the remove ads purchase flow
   */
  async purchaseRemoveAds(): Promise<boolean> {
    // Prevenir múltiplas compras simultâneas
    if (this.isPurchaseInProgress) {
      logger.log('PurchaseService: Purchase already in progress');
      return false;
    }

    if (!this.isConnected) {
      await this.initialize();
    }

    this.isPurchaseInProgress = true;

    return new Promise<boolean>((resolve) => {
      // Timeout after 2 minutes to prevent infinite loading
      const timeoutId = setTimeout(() => {
        logger.log('PurchaseService: Purchase timeout');
        this.onPurchaseComplete = null;
        this.isPurchaseInProgress = false;
        resolve(false);
      }, 120000);

      // Set callback for when purchase completes
      this.onPurchaseComplete = (success: boolean) => {
        clearTimeout(timeoutId);
        this.isPurchaseInProgress = false;
        resolve(success);
      };

      // Request the purchase using the new API format
      const purchaseRequest = Platform.OS === 'android'
        ? { google: { skus: [REMOVE_ADS_SKU] } }
        : { apple: { sku: REMOVE_ADS_SKU } };

      requestPurchase({
        request: purchaseRequest,
        type: 'in-app',
      }).catch((error) => {
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
   * Check if user has already purchased remove ads
   */
  async checkPurchaseStatus(): Promise<boolean> {
    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      const purchases = await getAvailablePurchases();
      logger.log('PurchaseService: Available purchases:', purchases.length);

      const hasRemoveAds = purchases.some(
        (purchase) => purchase.productId === REMOVE_ADS_SKU
      );

      return hasRemoveAds;
    } catch (error) {
      logger.error('PurchaseService: Error checking purchase status:', error);
      return false;
    }
  }

  /**
   * Restore previous purchases (important for iOS, also works on Android)
   */
  async restorePurchases(): Promise<boolean> {
    return this.checkPurchaseStatus();
  }

  /**
   * Get the formatted price of the remove ads product
   */
  async getFormattedPrice(): Promise<string> {
    const product = await this.getRemoveAdsProduct();

    if (product) {
      // Try localizedPrice first (iOS)
      if (product.localizedPrice) {
        return product.localizedPrice;
      }

      // Try price (generic)
      if (product.price) {
        return product.price;
      }

      // Android oneTimePurchaseOfferDetails fallback
      if (product.oneTimePurchaseOfferDetails?.formattedPrice) {
        return product.oneTimePurchaseOfferDetails.formattedPrice;
      }
    }

    return '3,69 €';
  }
}

export const purchaseService = new PurchaseService();
