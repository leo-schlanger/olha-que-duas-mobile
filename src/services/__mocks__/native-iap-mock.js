/**
 * Mock module for react-native-iap when running in Expo Go
 * This prevents bundling errors from native modules
 */

// Stub implementations that do nothing
const noop = () => {};
const noopAsync = () => Promise.resolve();
const noopAsyncFalse = () => Promise.resolve(false);
const noopAsyncArray = () => Promise.resolve([]);
const noopSubscription = () => ({ remove: noop });

module.exports = {
  // Connection
  initConnection: noopAsyncFalse,
  endConnection: noopAsync,

  // Products
  getProducts: noopAsyncArray,
  fetchProducts: noopAsyncArray,

  // Purchases
  requestPurchase: noopAsync,
  getAvailablePurchases: noopAsyncArray,
  finishTransaction: noopAsync,
  acknowledgePurchaseAndroid: noopAsync,
  consumePurchaseAndroid: noopAsync,

  // Subscriptions
  getSubscriptions: noopAsyncArray,
  requestSubscription: noopAsync,

  // Listeners
  purchaseUpdatedListener: noopSubscription,
  purchaseErrorListener: noopSubscription,

  // Utilities
  flushFailedPurchasesCachedAsPendingAndroid: noopAsync,
  clearTransactionIOS: noopAsync,
  clearProductsIOS: noopAsync,
  promotedProductListener: noopSubscription,

  // Constants
  PROMOTED_PRODUCT: 'PROMOTED_PRODUCT',
  IAPErrorCode: {
    E_UNKNOWN: 'E_UNKNOWN',
    E_USER_CANCELLED: 'E_USER_CANCELLED',
    E_ITEM_UNAVAILABLE: 'E_ITEM_UNAVAILABLE',
    E_REMOTE_ERROR: 'E_REMOTE_ERROR',
    E_NETWORK_ERROR: 'E_NETWORK_ERROR',
    E_RECEIPT_FAILED: 'E_RECEIPT_FAILED',
    E_RECEIPT_FINISHED_FAILED: 'E_RECEIPT_FINISHED_FAILED',
    E_NOT_PREPARED: 'E_NOT_PREPARED',
    E_NOT_ENDED: 'E_NOT_ENDED',
    E_ALREADY_OWNED: 'E_ALREADY_OWNED',
    E_DEVELOPER_ERROR: 'E_DEVELOPER_ERROR',
    E_BILLING_RESPONSE_JSON_PARSE_ERROR: 'E_BILLING_RESPONSE_JSON_PARSE_ERROR',
    E_DEFERRED_PAYMENT: 'E_DEFERRED_PAYMENT',
    E_INTERRUPTED: 'E_INTERRUPTED',
    E_IAP_NOT_AVAILABLE: 'E_IAP_NOT_AVAILABLE',
  },
};
