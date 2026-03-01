import { Platform } from 'react-native';
import * as RNIap from 'react-native-iap';

// Product IDs - must be created in Google Play Console and App Store Connect
const PRODUCT_IDS = {
  REMOVE_ADS: 'remove_ads', // Non-consumable product at 2.99€
};

const itemSkus = Platform.select({
  ios: [PRODUCT_IDS.REMOVE_ADS],
  android: [PRODUCT_IDS.REMOVE_ADS],
}) as string[];

class PurchaseService {
  private isConnected = false;
  private purchaseUpdateSubscription: any = null;
  private purchaseErrorSubscription: any = null;

  /**
   * Initialize connection with the store (Google Play / App Store)
   */
  async initialize(): Promise<void> {
    try {
      await RNIap.initConnection();
      this.isConnected = true;

      // Set up purchase listeners
      this.purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(
        async (purchase) => {
          const receipt = purchase.transactionReceipt;
          if (receipt) {
            // Acknowledge the purchase
            await RNIap.finishTransaction({ purchase, isConsumable: false });
          }
        }
      );

      this.purchaseErrorSubscription = RNIap.purchaseErrorListener((error) => {
        console.log('Purchase error:', error);
      });

      console.log('PurchaseService: Connected to store');
    } catch (error) {
      console.error('PurchaseService: Connection error:', error);
    }
  }

  /**
   * Disconnect from the store
   */
  async disconnect(): Promise<void> {
    try {
      if (this.purchaseUpdateSubscription) {
        this.purchaseUpdateSubscription.remove();
        this.purchaseUpdateSubscription = null;
      }
      if (this.purchaseErrorSubscription) {
        this.purchaseErrorSubscription.remove();
        this.purchaseErrorSubscription = null;
      }
      if (this.isConnected) {
        await RNIap.endConnection();
        this.isConnected = false;
        console.log('PurchaseService: Disconnected from store');
      }
    } catch (error) {
      console.error('PurchaseService: Disconnect error:', error);
    }
  }

  /**
   * Get remove ads product information
   */
  async getRemoveAdsProduct(): Promise<RNIap.Product | null> {
    try {
      if (!this.isConnected) {
        await this.initialize();
      }

      const products = await RNIap.getProducts({ skus: itemSkus });

      if (products && products.length > 0) {
        return products[0];
      }

      return null;
    } catch (error) {
      console.error('PurchaseService: Error getting product:', error);
      return null;
    }
  }

  /**
   * Start the remove ads purchase flow
   */
  async purchaseRemoveAds(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.initialize();
      }

      await RNIap.requestPurchase({ sku: PRODUCT_IDS.REMOVE_ADS });
      return true;
    } catch (error) {
      console.error('PurchaseService: Purchase error:', error);
      return false;
    }
  }

  /**
   * Check if user has already purchased remove ads
   */
  async checkPurchaseStatus(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.initialize();
      }

      const purchases = await RNIap.getAvailablePurchases();

      if (purchases) {
        const hasRemoveAds = purchases.some(
          (purchase) => purchase.productId === PRODUCT_IDS.REMOVE_ADS
        );
        return hasRemoveAds;
      }

      return false;
    } catch (error) {
      console.error('PurchaseService: Status check error:', error);
      return false;
    }
  }

  /**
   * Restore previous purchases (important for iOS)
   */
  async restorePurchases(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.initialize();
      }

      const purchases = await RNIap.getAvailablePurchases();

      if (purchases) {
        const hasRemoveAds = purchases.some(
          (purchase) => purchase.productId === PRODUCT_IDS.REMOVE_ADS
        );
        return hasRemoveAds;
      }

      return false;
    } catch (error) {
      console.error('PurchaseService: Restore error:', error);
      return false;
    }
  }

  /**
   * Get the formatted price of the product
   */
  async getFormattedPrice(): Promise<string> {
    const product = await this.getRemoveAdsProduct();
    return product?.localizedPrice || '2,99 €';
  }
}

export const purchaseService = new PurchaseService();
