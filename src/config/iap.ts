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
  monthly: 'club_pro_monthly',
  yearly: 'club_pro_yearly',
} as const;

export type SubscriptionPlanCycle = 'monthly' | 'yearly';

/** All subscription SKUs as a plain array (for getSubscriptions calls). */
export const ALL_SUBSCRIPTION_SKUS: string[] = [
  SUBSCRIPTION_PRODUCT_IDS.monthly,
  SUBSCRIPTION_PRODUCT_IDS.yearly,
];

/** Map a store product ID back to our plan cycle. Returns null for unknown IDs. */
export function getPlanCycleFromProductId(
  productId: string,
): SubscriptionPlanCycle | null {
  if (productId === SUBSCRIPTION_PRODUCT_IDS.monthly) return 'monthly';
  if (productId === SUBSCRIPTION_PRODUCT_IDS.yearly) return 'yearly';
  return null;
}
