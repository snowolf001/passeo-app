// src/services/iap.ts

/**
 * Subscription-mode IAP service.
 *
 * Responsibilities:
 * - keep app-level initialization shape stable
 * - optionally log/store-side purchase events for debugging
 * - never decide entitlement locally
 *
 * Non-responsibilities:
 * - no lifetime SKU handling
 * - no local Pro unlock based on getAvailablePurchases()
 * - no source-of-truth entitlement writes
 */

let initialized = false;

export async function initIap(): Promise<void> {
  if (initialized) {
    if (__DEV__) {
      console.log('[IAP] initIap skipped: already initialized');
    }
    return;
  }

  initialized = true;

  if (__DEV__) {
    console.log('[IAP] initIap start (subscription mode)');
  }

  // Keep this as the app-level entry point.
  // withIAPContext owns the billing connection lifecycle.
  // useClubProPurchase owns subscription loading / purchase flow.
  //
  // Do not:
  // - init/end native billing connection here
  // - unlock Pro locally here
  // - restore Pro locally here

  if (__DEV__) {
    console.log('[IAP] initIap done (subscription mode)');
  }
}

export async function syncProStatusFromStore(
  _forceRefresh?: boolean,
): Promise<void> {
  if (__DEV__) {
    console.log(
      '[IAP] syncProStatusFromStore skipped: backend is source of truth',
    );
  }

  // Intentionally no-op.
  // Club Pro status must come from backend subscription status.
}

export async function endIap(): Promise<void> {
  if (__DEV__) {
    console.log('[IAP] endIap skipped: withIAPContext owns connection');
  }

  // Intentionally no-op.
}
