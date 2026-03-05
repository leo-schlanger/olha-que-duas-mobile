// @ts-nocheck
/**
 * Purchase Service - In-App Purchases
 *
 * Handles Google Play Store purchases for removing ads
 */

import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  getProducts,
  requestPurchase,
  getAvailablePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type Product,
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

class PurchaseService {
  private isConnected = false;
  private products: Product[] = [];
  private purchaseUpdateSubscription: any = null;
  private purchaseErrorSubscription: any = null;
  private onPurchaseComplete: ((success: boolean) => void) | null = null;

  /**
   * Initialize connection with the store (Google Play / App Store)
   */
  async initialize(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      const result = await initConnection();
      console.log('PurchaseService: Connection result:', result);
      this.isConnected = true;

      // Setup purchase listeners
      this.setupListeners();

      // Load products
      await this.loadProducts();

      console.log('PurchaseService: Initialized successfully');
    } catch (error) {
      console.error('PurchaseService: Initialization error:', error);
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
        console.log('PurchaseService: Purchase updated:', purchase);

        const receipt = purchase.transactionReceipt;
        if (receipt) {
          try {
            // Acknowledge the purchase (required for Google Play)
            await finishTransaction({ purchase, isConsumable: false });
            console.log('PurchaseService: Transaction finished');

            // Notify success
            if (this.onPurchaseComplete) {
              this.onPurchaseComplete(true);
              this.onPurchaseComplete = null;
            }
          } catch (error) {
            console.error('PurchaseService: Error finishing transaction:', error);
          }
        }
      }
    );

    // Listen for purchase errors
    this.purchaseErrorSubscription = purchaseErrorListener(
      (error: PurchaseError) => {
        console.error('PurchaseService: Purchase error:', error);

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
      const products = await getProducts({ skus: PRODUCT_SKUS });
      this.products = products;
      console.log('PurchaseService: Products loaded:', products.length);
    } catch (error) {
      console.error('PurchaseService: Error loading products:', error);
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
        console.error('PurchaseService: Error disconnecting:', error);
      }
    }

    this.isConnected = false;
  }

  /**
   * Get remove ads product information
   */
  async getRemoveAdsProduct(): Promise<Product | null> {
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
    if (!this.isConnected) {
      await this.initialize();
    }

    return new Promise(async (resolve) => {
      try {
        // Set callback for when purchase completes
        this.onPurchaseComplete = resolve;

        // Request the purchase
        await requestPurchase({
          skus: [REMOVE_ADS_SKU],
        });

        // Note: The actual result comes through the listener
        // If requestPurchase throws, we resolve false
      } catch (error) {
        console.error('PurchaseService: Error requesting purchase:', error);
        this.onPurchaseComplete = null;
        resolve(false);
      }
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
      console.log('PurchaseService: Available purchases:', purchases.length);

      const hasRemoveAds = purchases.some(
        (purchase) => purchase.productId === REMOVE_ADS_SKU
      );

      return hasRemoveAds;
    } catch (error) {
      console.error('PurchaseService: Error checking purchase status:', error);
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
      // @ts-ignore - RN IAP types differ between OS/versions
      return product.localizedPrice ?? (product as any).oneTimePurchaseOfferDetails?.formattedPrice ?? '2,99 €';
    }

    return '2,99 €';
  }
}

export const purchaseService = new PurchaseService();
