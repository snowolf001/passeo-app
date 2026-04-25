// src/config/iap.ts
//
// Centralised subscription product IDs for club-level Pro.
// These must match the products configured in
// App Store Connect / Google Play Console.
//
// NOTE: The original one-time `passeo_pro` SKU (in appConfig.ts) is kept
// for backward-compat with UpgradeScreen. New club subscriptions use the
// IDs defined here.

export const SUBSCRIPTION_PRODUCT_IDS = {
  monthly: 'passeo_pro_monthly',
  yearly: 'passeo_pro_yearly',
} as const;

export type SubscriptionPlanCycle = 'monthly' | 'yearly';

/** Shorter alias — preferred in new code. */
export type PlanCycle = SubscriptionPlanCycle;

/**
 * Platform-keyed product IDs.
 * Currently identical for iOS and Android; kept separate so they can diverge
 * if App Store / Play Console product IDs ever need to differ.
 */
export const IAP_PRODUCTS = {
  ios: {
    monthly: SUBSCRIPTION_PRODUCT_IDS.monthly as string,
    yearly: 'Passeo_pro_yearly' as string,
  },
  android: {
    monthly: SUBSCRIPTION_PRODUCT_IDS.monthly as string,
    yearly: SUBSCRIPTION_PRODUCT_IDS.yearly as string,
  },
} as const;

/** All subscription SKUs as a plain array (for getSubscriptions calls). */
export const ALL_SUBSCRIPTION_SKUS: string[] = [
  SUBSCRIPTION_PRODUCT_IDS.monthly,
  SUBSCRIPTION_PRODUCT_IDS.yearly,
  'Passeo_pro_yearly',
];

/** Map a store product ID back to our plan cycle. Returns null for unknown IDs. */
export function getPlanCycleFromProductId(
  productId: string,
): SubscriptionPlanCycle | null {
  if (productId === SUBSCRIPTION_PRODUCT_IDS.monthly) return 'monthly';
  if (productId === SUBSCRIPTION_PRODUCT_IDS.yearly || productId === 'Passeo_pro_yearly') return 'yearly';
  return null;
}
