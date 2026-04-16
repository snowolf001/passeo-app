// src/hooks/useClubProPurchase.ts

import {useCallback, useEffect, useRef, useState} from 'react';
import {Platform} from 'react-native';
import {
  useIAP,
  getAvailablePurchases as iapGetAvailablePurchases,
} from 'react-native-iap';
import type {
  Purchase,
  RequestSubscriptionAndroid,
  RequestSubscriptionIOS,
  SubscriptionAndroid,
} from 'react-native-iap';

import {
  ALL_SUBSCRIPTION_SKUS,
  getPlanCycleFromProductId,
  SubscriptionPlanCycle,
} from '../config/iap';
import {verifyClubPurchase} from '../services/api/subscriptionApi';
import {normalizeForVerify} from '../services/clubSubscriptionService';
import {setIsPro} from '../services/entitlement';
import {ClubSubscriptionStatus} from '../types/subscription';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StoreProduct = {
  productId: string;
  title: string;
  localizedPrice: string;
  planCycle: SubscriptionPlanCycle;
};

export type RestoreResult = {
  status: ClubSubscriptionStatus | null;
  verifiedCount: number;
  verifyFailed: boolean;
};

export type UseClubProPurchaseResult = {
  products: StoreProduct[];
  loadingProducts: boolean;
  purchasing: boolean;
  restoring: boolean;
  error: string | null;
  clearError: () => void;
  purchase: (
    productId: string,
    clubId: string,
  ) => Promise<ClubSubscriptionStatus>;
  restore: (clubId: string) => Promise<RestoreResult>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractLocalizedPrice(sub: any): string {
  if (typeof sub.localizedPrice === 'string' && sub.localizedPrice) {
    return sub.localizedPrice;
  }

  const phase =
    sub.subscriptionOfferDetails?.[0]?.pricingPhases?.pricingPhaseList?.[0];

  if (phase?.formattedPrice) {
    return phase.formattedPrice;
  }

  return '';
}

function buildSubscriptionRequest(
  productId: string,
  androidSub: SubscriptionAndroid | undefined,
): RequestSubscriptionAndroid | RequestSubscriptionIOS {
  if (Platform.OS === 'android') {
    const offerToken =
      (androidSub as any)?.subscriptionOfferDetails?.[0]?.offerToken ?? '';

    return {
      subscriptionOffers: [{sku: productId, offerToken}],
    } as RequestSubscriptionAndroid;
  }

  return {
    sku: productId,
    andDangerouslyFinishTransactionAutomaticallyIOS: false,
  } as RequestSubscriptionIOS;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useClubProPurchase(): UseClubProPurchaseResult {
  const {
    subscriptions,
    currentPurchase,
    currentPurchaseError,
    getSubscriptions,
    requestSubscription,
    finishTransaction,
    clearCurrentPurchase,
    clearCurrentPurchaseError,
    connected,
  } = useIAP();

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const purchaseResolverRef = useRef<{
    productId: string;
    requestId: number;
    resolve: (p: Purchase) => void;
    reject: (e: Error) => void;
  } | null>(null);

  // ── Load products (WAIT for connected) ──────────────────────────────────────

  useEffect(() => {
    if (!connected) {
      return;
    }

    let cancelled = false;
    setLoadingProducts(true);

    getSubscriptions({skus: ALL_SUBSCRIPTION_SKUS})
      .catch(e => {
        if (!cancelled && __DEV__) {
          console.warn('[IAP] getSubscriptions error:', e);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProducts(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connected, getSubscriptions]);

  // ── Map products ────────────────────────────────────────────────────────────

  useEffect(() => {
    const mapped: StoreProduct[] = subscriptions
      .map(s => {
        const planCycle = getPlanCycleFromProductId(s.productId);

        if (!planCycle) {
          return null;
        }

        return {
          productId: s.productId,
          title: (s as any).title ?? '',
          localizedPrice: extractLocalizedPrice(s),
          planCycle,
        };
      })
      .filter((s): s is StoreProduct => s !== null);

    setProducts(mapped);
  }, [subscriptions]);

  // ── Handle purchase success ────────────────────────────────────────────────

  useEffect(() => {
    if (!currentPurchase || !purchaseResolverRef.current) {
      return;
    }

    const resolver = purchaseResolverRef.current;

    if (
      currentPurchase.productId !== resolver.productId ||
      resolver.requestId !== requestIdRef.current
    ) {
      return;
    }

    purchaseResolverRef.current = null;
    resolver.resolve(currentPurchase);
  }, [currentPurchase]);

  // ── Handle purchase error ──────────────────────────────────────────────────

  useEffect(() => {
    if (!currentPurchaseError || !purchaseResolverRef.current) {
      return;
    }

    const resolver = purchaseResolverRef.current;

    purchaseResolverRef.current = null;
    clearCurrentPurchaseError();

    const err =
      currentPurchaseError.code === 'E_USER_CANCELLED'
        ? new Error('USER_CANCELLED')
        : new Error(currentPurchaseError.message ?? 'Purchase failed');

    resolver.reject(err);
  }, [currentPurchaseError, clearCurrentPurchaseError]);

  // ── purchase() ─────────────────────────────────────────────────────────────

  const purchase = useCallback(
    async (
      productId: string,
      clubId: string,
    ): Promise<ClubSubscriptionStatus> => {
      if (purchasing || restoring) {
        throw new Error('Operation in progress');
      }

      if (!connected) {
        throw new Error('Store not connected');
      }

      setPurchasing(true);
      setError(null);

      const requestId = Date.now();
      requestIdRef.current = requestId;

      try {
        clearCurrentPurchase();
        clearCurrentPurchaseError();

        const storePromise = new Promise<Purchase>((resolve, reject) => {
          purchaseResolverRef.current = {
            productId,
            requestId,
            resolve,
            reject,
          };
        });

        const androidSub = subscriptions.find(
          s => s.productId === productId,
        ) as SubscriptionAndroid | undefined;

        const request = buildSubscriptionRequest(productId, androidSub);

        await requestSubscription(request as any);

        const storePurchase = await storePromise;

        const payload = normalizeForVerify(storePurchase, clubId);
        const status = await verifyClubPurchase(payload);

        try {
          await finishTransaction({
            purchase: storePurchase,
            isConsumable: false,
          });
        } catch (finishError) {
          if (__DEV__) {
            console.warn(
              '[IAP purchase] finishTransaction failed:',
              finishError,
            );
          }
        }

        await setIsPro(status.isPro);

        return status;
      } catch (e: any) {
        if (purchaseResolverRef.current?.requestId === requestId) {
          purchaseResolverRef.current = null;
        }

        if (__DEV__) {
          console.error('[IAP purchase error]', e);
        }

        if (e?.message !== 'USER_CANCELLED') {
          setError(e?.message ?? 'Purchase failed');
        }

        throw e;
      } finally {
        setPurchasing(false);
      }
    },
    [
      purchasing,
      restoring,
      connected,
      subscriptions,
      requestSubscription,
      finishTransaction,
      clearCurrentPurchase,
      clearCurrentPurchaseError,
    ],
  );

  // ── restore() ─────────────────────────────────────────────────────────────

  const restore = useCallback(
    async (clubId: string): Promise<RestoreResult> => {
      if (purchasing || restoring) {
        throw new Error('Operation in progress');
      }

      if (!connected) {
        throw new Error('Store not connected');
      }

      setRestoring(true);
      setError(null);

      try {
        const allPurchases = await iapGetAvailablePurchases();

        const subPurchases = allPurchases.filter(p =>
          ALL_SUBSCRIPTION_SKUS.includes(p.productId),
        );

        if (subPurchases.length === 0) {
          return {
            status: null,
            verifiedCount: 0,
            verifyFailed: false,
          };
        }

        // Only verify the latest matching subscription purchase.
        const latest = subPurchases.sort(
          (a, b) =>
            Number(b.transactionDate ?? 0) - Number(a.transactionDate ?? 0),
        )[0];

        let status: ClubSubscriptionStatus | null = null;
        let verified = false;

        try {
          const payload = normalizeForVerify(latest, clubId);
          status = await verifyClubPurchase(payload);
          verified = true;

          try {
            await finishTransaction({purchase: latest, isConsumable: false});
          } catch (finishError) {
            if (__DEV__) {
              console.warn(
                '[IAP restore] finishTransaction failed:',
                finishError,
              );
            }
          }
        } catch (e) {
          if (__DEV__) {
            console.warn('[IAP restore verify failed]', e);
          }
        }

        if (status) {
          await setIsPro(status.isPro);
        }

        return {
          status,
          verifiedCount: verified ? 1 : 0,
          verifyFailed: !verified,
        };
      } catch (e: any) {
        setError(e?.message ?? 'Restore failed');
        throw e;
      } finally {
        setRestoring(false);
      }
    },
    [purchasing, restoring, connected, finishTransaction],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    products,
    loadingProducts,
    purchasing,
    restoring,
    error,
    clearError,
    purchase,
    restore,
  };
}
