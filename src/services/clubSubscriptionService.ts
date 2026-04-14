// src/services/clubSubscriptionService.ts
//
// Club-level subscription purchase flow.
//
// Responsibilities:
// - Fetch subscription products from the store
// - Request a subscription purchase (monthly / yearly)
// - Normalize the platform-specific purchase object for backend verify
// - Submit to backend verify BEFORE finishing the transaction
// - Support restore purchases with per-purchase backend verify
//
// Platform differences are contained here. UI layers only call
// purchaseClubSubscription() or restoreClubSubscriptions().

import {Platform} from 'react-native';
import * as RNIap from 'react-native-iap';
import type {Purchase, PurchaseError, Subscription} from 'react-native-iap';
import {ALL_SUBSCRIPTION_SKUS, getPlanCycleFromProductId} from '../config/iap';
import {verifyClubPurchase} from './api/subscriptionApi';
import {setIsPro} from './entitlement';
import {
  ClubSubscriptionStatus,
  VerifyPurchasePayload,
} from '../types/subscription';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StoreSubscriptionProduct = {
  productId: string;
  title: string;
  description: string;
  localizedPrice: string;
  currency: string;
  planCycle: 'monthly' | 'yearly';
};

// ─── Fetch products ───────────────────────────────────────────────────────────

/**
 * Fetch the monthly/yearly subscription products from the store.
 * Returns an empty array if the store is unavailable — UI must handle this.
 */
export async function fetchSubscriptionProducts(): Promise<
  StoreSubscriptionProduct[]
> {
  try {
    await RNIap.initConnection();
    const subs: Subscription[] = await RNIap.getSubscriptions({
      skus: ALL_SUBSCRIPTION_SKUS,
    });
    return subs
      .map(s => {
        const planCycle = getPlanCycleFromProductId(s.productId);
        if (!planCycle) return null;
        // react-native-iap v13: platform-specific fields accessed via any cast
        const sub = s as any;
        return {
          productId: s.productId,
          title: sub.title ?? sub.name ?? '',
          description: sub.description ?? '',
          localizedPrice:
            sub.localizedPrice ??
            sub.oneTimePurchaseOfferDetails?.formattedPrice ??
            '',
          currency: sub.currency ?? '',
          planCycle,
        };
      })
      .filter((s): s is StoreSubscriptionProduct => s !== null);
  } catch (e) {
    if (__DEV__) console.warn('[ClubSub] fetchSubscriptionProducts error:', e);
    return [];
  }
}

// ─── Normalise purchase for backend ───────────────────────────────────────────

/**
 * Extract all fields the backend needs for verification from a raw store purchase.
 * iOS and Android fields are collected here so no UI layer needs to know.
 */
export function normalizeForVerify(
  purchase: Purchase,
  clubId: string,
): VerifyPurchasePayload {
  if (Platform.OS === 'ios') {
    return {
      clubId,
      platform: 'ios',
      provider: 'app_store',
      productId: purchase.productId,
      receiptData: purchase.transactionReceipt ?? null,
      transactionId: purchase.transactionId ?? null,
      originalTransactionId:
        (purchase as any).originalTransactionIdentifierIOS ?? null,
    };
  }
  return {
    clubId,
    platform: 'android',
    provider: 'google_play',
    productId: purchase.productId,
    purchaseToken: (purchase as any).purchaseToken ?? null,
    orderId: purchase.transactionId ?? null,
  };
}

// ─── Finish transaction ───────────────────────────────────────────────────────

/** Safely finish a transaction. Must only be called after backend verify succeeds. */
async function finishTransactionSafe(purchase: Purchase) {
  try {
    await RNIap.finishTransaction({purchase, isConsumable: false});
  } catch (e) {
    if (__DEV__)
      console.warn('[ClubSub] finishTransaction error (non-fatal):', e);
  }
}

// ─── Purchase a subscription ──────────────────────────────────────────────────

/**
 * Main purchase flow:
 *  1. Register one-shot purchase/error listeners
 *  2. Request subscription via platform store
 *  3. Wait for purchase event (or error/cancel)
 *  4. Normalize + submit to backend verify
 *  5. Only after successful verify: finish transaction + cache Pro state
 *
 * Throws with message 'USER_CANCELLED' if the user dismissed the dialog.
 * Throws ApiError if backend verify fails.
 */
export async function purchaseClubSubscription(
  productId: string,
  clubId: string,
): Promise<ClubSubscriptionStatus> {
  // Ensure connection is open (idempotent).
  await RNIap.initConnection();

  // ── Step 1: Set up one-shot listeners ──────────────────────────────────────
  const purchase = await new Promise<Purchase>((resolve, reject) => {
    let settled = false;
    let purchaseListener: {remove: () => void} | null = null;
    let errorListener: {remove: () => void} | null = null;

    const cleanup = () => {
      purchaseListener?.remove();
      errorListener?.remove();
      purchaseListener = null;
      errorListener = null;
    };

    purchaseListener = RNIap.purchaseUpdatedListener((p: Purchase) => {
      // Only handle our target subscription product.
      if (p.productId !== productId) return;
      if (settled) return;
      settled = true;
      cleanup();
      if (__DEV__) console.log('[ClubSub] Purchase received:', p.productId);
      resolve(p);
    });

    errorListener = RNIap.purchaseErrorListener((error: PurchaseError) => {
      // Attribute any error while waiting to the in-flight purchase.
      if (settled) return;
      settled = true;
      cleanup();
      if (__DEV__)
        console.log('[ClubSub] Purchase error:', error.code, error.message);
      if (error.code === 'E_USER_CANCELLED') {
        reject(new Error('USER_CANCELLED'));
      } else {
        reject(new Error(error.message || 'Purchase failed'));
      }
    });

    // ── Step 2: Request subscription ─────────────────────────────────────────
    const doRequest = async () => {
      try {
        // react-native-iap v13: requestSubscription uses sku (singular) for both platforms
        await RNIap.requestSubscription({
          sku: productId,
          andDangerouslyFinishTransactionAutomaticallyIOS:
            Platform.OS === 'ios' ? false : undefined,
        } as any);
      } catch (e: any) {
        if (settled) return;
        settled = true;
        cleanup();
        if (e?.code === 'E_USER_CANCELLED' || e?.message === 'USER_CANCELLED') {
          reject(new Error('USER_CANCELLED'));
        } else {
          reject(
            e instanceof Error
              ? e
              : new Error(e?.message || 'Purchase request failed'),
          );
        }
      }
    };

    void doRequest();
  });

  // ── Step 3: Verify with backend ────────────────────────────────────────────
  // Do NOT grant Pro before verify.
  if (__DEV__) console.log('[ClubSub] Verifying purchase with backend...');
  const payload = normalizeForVerify(purchase, clubId);
  const status = await verifyClubPurchase(payload);

  // ── Step 4: Finish transaction (only after successful verify) ──────────────
  await finishTransactionSafe(purchase);

  // Cache Pro state locally so hooks that read AsyncStorage stay in sync.
  await setIsPro(status.isPro);

  if (__DEV__) console.log('[ClubSub] Verify success. isPro:', status.isPro);

  return status;
}

// ─── Restore purchases ────────────────────────────────────────────────────────

export type RestoreResult = {
  /** Final status from the last successful verify, or null if none verified. */
  status: ClubSubscriptionStatus | null;
  /** Number of subscription purchases successfully verified. */
  verifiedCount: number;
  /** True if there were relevant purchases but none verified successfully. */
  verifyFailed: boolean;
};

/**
 * Restore flow:
 *  1. Get all available purchases from the platform store
 *  2. Filter to our subscription SKUs
 *  3. Submit each to backend verify
 *  4. On at least one success, cache Pro state
 *
 * Returns a RestoreResult so the caller can show appropriate UI.
 * Never throws for individual verify failures — only for connection errors.
 */
export async function restoreClubSubscriptions(
  clubId: string,
): Promise<RestoreResult> {
  await RNIap.initConnection();

  const allPurchases = await RNIap.getAvailablePurchases();
  const subPurchases = allPurchases.filter(p =>
    ALL_SUBSCRIPTION_SKUS.includes(p.productId),
  );

  if (__DEV__)
    console.log(
      '[ClubSub] Restore: found subscription purchases:',
      subPurchases.length,
    );

  if (subPurchases.length === 0) {
    return {status: null, verifiedCount: 0, verifyFailed: false};
  }

  let lastStatus: ClubSubscriptionStatus | null = null;
  let verifiedCount = 0;
  let anyFailed = false;

  for (const purchase of subPurchases) {
    try {
      const payload = normalizeForVerify(purchase, clubId);
      const status = await verifyClubPurchase(payload);
      lastStatus = status;
      verifiedCount++;
      await finishTransactionSafe(purchase);
    } catch (e) {
      anyFailed = true;
      if (__DEV__)
        console.warn(
          '[ClubSub] Restore verify failed for',
          purchase.productId,
          e,
        );
    }
  }

  if (lastStatus) {
    await setIsPro(lastStatus.isPro);
  }

  return {
    status: lastStatus,
    verifiedCount,
    verifyFailed: anyFailed && verifiedCount === 0,
  };
}
