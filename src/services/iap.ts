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

/**
 * App-level IAP initialization entry point.
 *
 * IMPORTANT ARCHITECTURE RULE (Passeo):
 *
 * Passeo uses CLUB-LEVEL subscriptions.
 * The backend is the ONLY source of truth for Pro status.
 *
 * Therefore:
 * - Do NOT check Store purchases here
 * - Do NOT call getAvailablePurchases() here
 * - Do NOT restore purchases here
 * - Do NOT write any entitlement (isPro) to local storage here
 * - Do NOT gate app startup on any Store logic
 *
 * Store APIs are ONLY used in:
 * - purchase flow (useClubProPurchase)
 * - restore flow (explicit user action)
 *
 * Any change here that reads Store state for entitlement
 * will break club-level subscription logic.
 */
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

  // Intentionally empty.
  // withIAPContext handles connection lifecycle.
  // Purchase / restore flows are handled elsewhere.

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
