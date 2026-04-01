// src/services/iap.ts
/**
 * In-App Purchase service for Pro lifetime upgrade
 * Supports both iOS (StoreKit) and Android (Google Play Billing)
 */

import {Alert, Platform} from 'react-native';
import * as RNIap from 'react-native-iap';
import {Product, Purchase, PurchaseError} from 'react-native-iap';
import {IAP_CONFIG} from '../config/appConfig';
import {getIsPro, setIsPro} from './entitlement';

// Product IDs from centralized config
const PRODUCT_IDS = IAP_CONFIG.PRODUCT_IDS;
export const PRO_LIFETIME_SKU = IAP_CONFIG.PRO_LIFETIME_SKU;

const ENABLE_IAP = true;
const MOCK_IAP_FOR_TESTING = __DEV__ && IAP_CONFIG.MOCK_IAP_IN_DEV;

// Platform-aware store name for user-facing messages
const STORE_NAME = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

// Internal state
let isInitialized = false;
let initPromise: Promise<void> | null = null;
let iapReady = false;
let cachedProducts: Product[] = [];
let purchaseUpdateSubscription: {remove: () => void} | null = null;
let purchaseErrorSubscription: {remove: () => void} | null = null;

// Purchase flow coordination
let activePurchasePromise: {
  sku: string;
  resolve: () => void;
  reject: (error: Error) => void;
} | null = null;

/**
 * Resolve active purchase promise if it matches the SKU
 */
function resolveActivePurchase(sku: string) {
  if (activePurchasePromise && activePurchasePromise.sku === sku) {
    console.log('[IAP] Resolving active purchase promise for:', sku);
    activePurchasePromise.resolve();
    activePurchasePromise = null;
  }
}

/**
 * Reject active purchase promise if it matches the SKU
 */
function rejectActivePurchase(sku: string, error: Error) {
  if (activePurchasePromise && activePurchasePromise.sku === sku) {
    console.log('[IAP] Rejecting active purchase promise for:', sku);
    activePurchasePromise.reject(error);
    activePurchasePromise = null;
  }
}

/**
 * Clear active purchase promise without resolving/rejecting
 */
function clearActivePurchase() {
  activePurchasePromise = null;
}

/**
 * Persist final entitlement state.
 * Store is the source of truth; local storage is only cache.
 */
async function applyProEntitlement(isPro: boolean): Promise<boolean> {
  await setIsPro(isPro);
  console.log('[IAP] Final Pro entitlement set to:', isPro);
  return isPro;
}

/**
 * Safely detect whether store purchases include the Pro SKU.
 */
function hasProPurchase(purchases: Purchase[]): boolean {
  return purchases.some(p => p.productId === PRO_LIFETIME_SKU);
}

/**
 * Initialize IAP connection and set up listeners
 */
export async function initIap(): Promise<void> {
  if (!ENABLE_IAP) {
    iapReady = false;
    isInitialized = false;
    return;
  }

  if (initPromise) {
    console.log('[IAP] Initialization already in progress, waiting...');
    return initPromise;
  }

  if (isInitialized) {
    console.log('[IAP] Already initialized');
    return;
  }

  initPromise = (async () => {
    try {
      console.log('[IAP] Initializing...');

      await RNIap.initConnection();
      console.log('[IAP] Connection established');

      if (Platform.OS === 'android') {
        try {
          await RNIap.flushFailedPurchasesCachedAsPendingAndroid();
        } catch (e) {
          console.warn(
            '[IAP] flushFailedPurchasesCachedAsPendingAndroid failed (ignored):',
            e,
          );
        }
      }

      purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(
        async (purchase: Purchase) => {
          console.log('[IAP] Purchase updated:', purchase.productId);

          try {
            const receipt = purchase.transactionReceipt;
            if (!receipt) {
              console.warn('[IAP] Purchase update missing receipt');
              return;
            }

            if (purchase.productId !== PRO_LIFETIME_SKU) {
              console.warn(
                '[IAP] Purchase update for unknown product:',
                purchase.productId,
              );
              return;
            }

            console.log('[IAP] Purchase successful, granting Pro access');
            await applyProEntitlement(true);

            try {
              await RNIap.finishTransaction({
                purchase,
                isConsumable: false,
              });
              console.log('[IAP] Transaction finished successfully');
            } catch (finishError) {
              console.error(
                '[IAP] Error finishing transaction after granting Pro:',
                finishError,
              );
              // Keep Pro access granted. User can restore later if needed.
            }

            resolveActivePurchase(purchase.productId);

            Alert.alert(
              '🎉 Welcome to Pro!',
              'Pro features unlocked for Passeo.',
              [{text: 'Awesome!'}],
            );
          } catch (error) {
            console.error('[IAP] Error processing purchase:', error);

            rejectActivePurchase(
              purchase.productId,
              error instanceof Error
                ? error
                : new Error('Unknown purchase processing error'),
            );

            Alert.alert(
              'Purchase Pending',
              'Your purchase was received, but we could not finish processing it right now. Please tap "Restore Purchases" or try again later.',
              [{text: 'OK'}],
            );
          }
        },
      );

      purchaseErrorSubscription = RNIap.purchaseErrorListener(
        async (error: PurchaseError) => {
          console.warn('[IAP] Purchase error:', error);

          if (error.code === 'E_USER_CANCELLED') {
            console.log('[IAP] Purchase cancelled by user');
            if (activePurchasePromise) {
              activePurchasePromise.reject(new Error('USER_CANCELLED'));
              activePurchasePromise = null;
            }
            return;
          }

          if (
            error.code === 'E_ALREADY_OWNED' ||
            error.message?.includes('already owned')
          ) {
            console.log('[IAP] Product already owned');

            await syncProStatusFromStore(true);
            resolveActivePurchase(PRO_LIFETIME_SKU);

            Alert.alert(
              'Already Purchased',
              'You already own this product. Activating Pro access...',
              [{text: 'OK'}],
            );
            return;
          }

          console.error('[IAP] Purchase error code:', error.code);

          if (activePurchasePromise) {
            activePurchasePromise.reject(
              new Error(error.message || 'Purchase failed'),
            );
            activePurchasePromise = null;
          }

          Alert.alert(
            'Unable to Purchase',
            `The ${STORE_NAME} is temporarily unavailable. Please try again in a moment, or use "Restore Purchases".`,
            [{text: 'OK'}],
          );
        },
      );

      console.log('[IAP] Fetching products to validate setup...');
      try {
        cachedProducts = await RNIap.getProducts({skus: PRODUCT_IDS});
        const proProduct = cachedProducts.find(
          p => p.productId === PRO_LIFETIME_SKU,
        );

        if (proProduct) {
          iapReady = true;
          console.log(
            '[IAP] Products loaded successfully. Pro SKU:',
            proProduct.productId,
            proProduct.localizedPrice,
          );
          console.log('[IAP] iapReady:', iapReady);
        } else {
          console.warn('[IAP] Pro product not found in store response');
          console.warn(
            '[IAP] Available products:',
            cachedProducts.map(p => p.productId),
          );
          iapReady = false;
        }
      } catch (productError) {
        console.error(
          '[IAP] Failed to fetch products during init:',
          productError,
        );
        iapReady = false;
      }

      isInitialized = true;
      console.log('[IAP] Initialization complete. iapReady:', iapReady);
    } catch (error: any) {
      console.warn(
        '[IAP] Initialization failed (IAP disabled on this device):',
        error,
      );

      isInitialized = false;
      iapReady = false;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Get available products from store
 */
export async function getProducts(): Promise<Product[]> {
  try {
    console.log('[IAP] Fetching products:', PRODUCT_IDS);

    if (!ENABLE_IAP) {
      return [];
    }

    if (cachedProducts.length > 0) {
      console.log('[IAP] Returning cached products:', cachedProducts.length);
      return cachedProducts;
    }

    const products = await RNIap.getProducts({skus: PRODUCT_IDS});
    cachedProducts = products;

    console.log('[IAP] Products fetched:', products.length);

    if (products.length === 0) {
      console.warn(
        '[IAP] No products returned from store. This usually means:',
      );
      console.warn(
        '[IAP] 1. Products not configured in App Store Connect / Google Play Console',
      );
      console.warn('[IAP] 2. Bundle ID mismatch');
      console.warn('[IAP] 3. Product IDs mismatch');
      console.warn(
        '[IAP] 4. App not signed with distribution certificate (iOS)',
      );
      console.warn('[IAP] Expected product IDs:', PRODUCT_IDS);
    }

    products.forEach(p => {
      console.log(`[IAP] - ${p.productId}: ${p.localizedPrice}`);
    });

    const proProduct = products.find(p => p.productId === PRO_LIFETIME_SKU);
    iapReady = !!proProduct;

    return products;
  } catch (error: any) {
    console.warn('[IAP] Error fetching products (returning empty):', error);
    iapReady = false;
    return [];
  }
}

/**
 * Purchase Pro lifetime upgrade
 * Resolves only after entitlement has been granted (or already owned restored).
 */
export async function purchasePro(): Promise<void> {
  try {
    console.log('[IAP] Starting purchase for:', PRO_LIFETIME_SKU);
    console.log('[IAP] Platform:', Platform.OS);

    if (MOCK_IAP_FOR_TESTING) {
      console.log('[IAP] 🧪 DEV MOCK: Simulating successful purchase');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await applyProEntitlement(true);
      Alert.alert(
        '✅ Purchase Successful (Mock)',
        'Pro activated! This is a mock purchase for development testing.\n\n' +
          'To test real purchases, configure the product in App Store Connect / Google Play Console.',
        [{text: 'OK'}],
      );
      return;
    }

    // Do not trust cached local Pro state here.
    const isPro = await syncProStatusFromStore(true);
    if (isPro) {
      Alert.alert('Passeo Pro', 'You already have Passeo Pro!', [{text: 'OK'}]);
      return;
    }

    if (!isInitialized) {
      console.log('[IAP] Not initialized before purchase, initializing...');
      await initIap();
    }

    if (!iapReady) {
      console.log('[IAP] Store not ready, refreshing products...');
      try {
        await getProducts();
      } catch (refreshError) {
        console.error('[IAP] Failed to refresh products:', refreshError);
      }

      if (!iapReady) {
        console.error('[IAP] Store still not ready after refresh');
        Alert.alert(
          'Store Unavailable',
          `The ${STORE_NAME} is temporarily unavailable. Please try again later.`,
          [{text: 'OK'}],
        );
        return;
      }
    }

    const targetProduct = cachedProducts.find(
      p => p.productId === PRO_LIFETIME_SKU,
    );

    if (!targetProduct) {
      console.error('[IAP] Product not found in cached products');
      Alert.alert(
        'Store Unavailable',
        `The ${STORE_NAME} is temporarily unavailable. Please try again later.`,
        [{text: 'OK'}],
      );
      return;
    }

    console.log(
      '[IAP] Product ready:',
      targetProduct.productId,
      targetProduct.localizedPrice,
    );

    if (activePurchasePromise) {
      console.warn('[IAP] Purchase already in progress');
      return;
    }

    const completionPromise = new Promise<void>((resolve, reject) => {
      activePurchasePromise = {
        sku: PRO_LIFETIME_SKU,
        resolve,
        reject,
      };
    });

    if (Platform.OS === 'ios') {
      await RNIap.requestPurchase({
        sku: PRO_LIFETIME_SKU,
        andDangerouslyFinishTransactionAutomaticallyIOS: false,
      });
    } else {
      await RNIap.requestPurchase({
        skus: [PRO_LIFETIME_SKU],
      });
    }

    console.log('[IAP] Purchase request sent, waiting for completion...');

    await completionPromise;

    console.log('[IAP] Purchase completed and entitlement granted');
  } catch (error: any) {
    console.error('[IAP] Purchase error:', error);
    console.error('[IAP] Error code:', error.code);
    console.error('[IAP] Error message:', error.message);

    clearActivePurchase();

    if (
      error.message === 'USER_CANCELLED' ||
      error.code === 'E_USER_CANCELLED'
    ) {
      return;
    }

    Alert.alert(
      'Unable to Purchase',
      `The ${STORE_NAME} is temporarily unavailable. Please try again in a moment, or use "Restore Purchases".`,
      [{text: 'OK'}],
    );
  }
}

/**
 * Restore previous purchases (user-initiated, shows alerts)
 * For silent automatic restore on startup, use syncProStatusFromStore(true)
 */
export async function restorePurchases(): Promise<void> {
  try {
    console.log('[IAP] Restoring purchases (user-initiated)...');

    if (!isInitialized) {
      await initIap();
    }

    const purchases = await RNIap.getAvailablePurchases();
    console.log('[IAP] Found purchases:', purchases.length);

    if (hasProPurchase(purchases)) {
      console.log('[IAP] Pro lifetime purchase found, activating...');
      await applyProEntitlement(true);

      for (const purchase of purchases) {
        try {
          await RNIap.finishTransaction({
            purchase,
            isConsumable: false,
          });
        } catch (finishError) {
          console.warn('[IAP] Error finishing transaction:', finishError);
        }
      }

      Alert.alert(
        '✅ Purchases Restored',
        'Your Passeo Pro access has been restored!',
        [{text: 'OK'}],
      );
    } else {
      await applyProEntitlement(false);

      Alert.alert(
        'No Purchases Found',
        'No previous purchases were found for this account.',
        [{text: 'OK'}],
      );
    }
  } catch (error: any) {
    console.error('[IAP] Restore error:', error);

    // Fail closed: never preserve stale Pro entitlement on restore errors.
    await applyProEntitlement(false);

    Alert.alert(
      'Restore Failed',
      'Unable to restore purchases. Please try again or contact support.',
      [{text: 'OK'}],
    );
  }
}

/**
 * Sync Pro status from store purchases
 * Call this on app start to check existing purchases
 * @param silent - If true, don't show alerts (for automatic startup sync)
 * @returns Promise resolving to Pro status after sync
 */
export async function syncProStatusFromStore(
  silent: boolean = false,
): Promise<boolean> {
  if (!ENABLE_IAP) {
    return getIsPro();
  }

  try {
    if (!isInitialized) {
      await initIap();
    }

    if (!silent) {
      console.log('[IAP] Syncing Pro status from store...');
    }

    const purchases = await RNIap.getAvailablePurchases();
    const isPro = hasProPurchase(purchases);

    if (!silent) {
      console.log(
        '[IAP] Store entitlement result:',
        isPro,
        'purchaseCount=',
        purchases.length,
      );
      console.log(
        '[IAP] Purchase productIds:',
        purchases.map(p => p.productId),
      );
    }

    return applyProEntitlement(isPro);
  } catch (error: any) {
    console.error('[IAP] Error syncing Pro status:', error);

    // Critical fix:
    // Never preserve stale local Pro when store sync fails.
    // Fail closed to avoid granting unpaid Pro access.
    if (!silent) {
      console.log('[IAP] Sync failed, forcing Pro to false');
    }

    return applyProEntitlement(false);
  }
}

/**
 * Disconnect and cleanup
 */
export async function endIap(): Promise<void> {
  try {
    console.log('[IAP] Cleaning up...');

    if (purchaseUpdateSubscription) {
      purchaseUpdateSubscription.remove();
      purchaseUpdateSubscription = null;
    }

    if (purchaseErrorSubscription) {
      purchaseErrorSubscription.remove();
      purchaseErrorSubscription = null;
    }

    await RNIap.endConnection();

    isInitialized = false;
    iapReady = false;
    cachedProducts = [];
    clearActivePurchase();

    console.log('[IAP] Cleanup complete');
  } catch (error: any) {
    console.error('[IAP] Cleanup error:', error);
  }
}

/**
 * Get current initialization status
 */
export function isIapInitialized(): boolean {
  return isInitialized;
}

/**
 * Check if IAP is ready for purchases (store connected and products loaded)
 */
export function isIapReady(): boolean {
  return iapReady;
}
