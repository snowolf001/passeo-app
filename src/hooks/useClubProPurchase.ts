// src/hooks/useClubProPurchase.ts

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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

function extractLocalizedPrice(sub: any): string {
  if (typeof sub?.localizedPrice === 'string' && sub.localizedPrice) {
    return sub.localizedPrice;
  }

  const phase =
    sub?.subscriptionOfferDetails?.[0]?.pricingPhases?.pricingPhaseList?.[0];

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

    if (__DEV__) {
      console.log('[IAP] buildSubscriptionRequest(android)', {
        productId,
        hasAndroidSub: !!androidSub,
        offerTokenPresent: !!offerToken,
        offerCount: (androidSub as any)?.subscriptionOfferDetails?.length ?? 0,
        subscriptionOfferDetails:
          (androidSub as any)?.subscriptionOfferDetails ?? [],
      });
    }

    if (!offerToken) {
      throw new Error(
        'Android subscription offerToken is missing. Check Play Console base plan / offer setup.',
      );
    }

    return {
      sku: productId,
      subscriptionOffers: [{sku: productId, offerToken}],
    } as RequestSubscriptionAndroid;
  }

  if (__DEV__) {
    console.log('[IAP] buildSubscriptionRequest(ios)', {productId});
  }

  return {
    sku: productId,
    andDangerouslyFinishTransactionAutomaticallyIOS: false,
  } as RequestSubscriptionIOS;
}

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
    initConnectionError,
  } = useIAP();

  // Hold the latest getSubscriptions in a ref so we can call it from an
  // effect without listing it as a dependency. useIAP can recreate
  // getSubscriptions when the subscriptions array changes, so putting it in
  // deps can restart the loading effect and keep the spinner alive forever.
  const getSubscriptionsRef = useRef(getSubscriptions);

  useEffect(() => {
    getSubscriptionsRef.current = getSubscriptions;
  }, [getSubscriptions]);

  const safeSubscriptions = useMemo(
    () => (Array.isArray(subscriptions) ? subscriptions : []),
    [subscriptions],
  );

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
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

  useEffect(() => {
    if (__DEV__) {
      console.log('[IAP] connected changed:', connected);
      console.log(
        '[DIAG] connected:',
        connected,
        'initConnectionError:',
        initConnectionError?.message ?? null,
      );
    }
  }, [connected, initConnectionError]);

  // ── Load products when the billing connection is ready ─────────────────────
  // IMPORTANT: only depend on `connected` and `initConnectionError`.
  // Do NOT add `getSubscriptions` here — useIAP can recreate it on store state
  // changes, which would restart this effect and create a spinner loop.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (__DEV__) {
      console.log('[IAP] load effect entered', {
        connected,
        initConnectionError: initConnectionError?.message ?? null,
        skus: ALL_SUBSCRIPTION_SKUS,
      });
    }

    // Billing client failed to connect entirely.
    if (initConnectionError) {
      if (__DEV__) {
        console.warn('[IAP] initConnectionError:', initConnectionError);
      }
      setLoadingProducts(false);
      setProducts([]);
      setError('Could not connect to the store. Please try again.');
      return () => {
        cancelled = true;
      };
    }

    // Connection not yet established — wait for it.
    if (!connected) {
      if (__DEV__) {
        console.log('[IAP] waiting for store connection...');
      }
      setLoadingProducts(true);
      return () => {
        cancelled = true;
      };
    }

    setLoadingProducts(true);
    setError(null);

    if (__DEV__) {
      console.log('[IAP] loading subscriptions', {skus: ALL_SUBSCRIPTION_SKUS});
    }

    // 10-second safety timeout so the spinner never stays forever.
    timeoutId = setTimeout(() => {
      if (!cancelled) {
        if (__DEV__) {
          console.warn('[IAP] loading subscriptions timed out after 10s');
        }
        setLoadingProducts(false);
        setError('Loading plans timed out. Please try again.');
      }
    }, 10_000);

    // getSubscriptions() populates the context subscriptions state.
    getSubscriptionsRef
      .current({skus: ALL_SUBSCRIPTION_SKUS})
      .then(() => {
        if (__DEV__) {
          console.log('[IAP] getSubscriptions resolved');
        }
      })
      .catch(e => {
        if (!cancelled) {
          const msg = e?.message ?? 'Failed to load subscription plans.';
          if (__DEV__) {
            console.warn('[IAP] getSubscriptions error:', msg, e);
          }
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (__DEV__) {
            console.log('[IAP] getSubscriptions call finished');
            console.log(
              '[DIAG] subscriptions in context after load:',
              safeSubscriptions.length,
              safeSubscriptions.map(s => s.productId),
            );
          }
          setLoadingProducts(false);
        }
      });

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [connected, initConnectionError]);

  // Map context subscriptions → StoreProduct[] whenever the list changes.
  useEffect(() => {
    const mapped: StoreProduct[] = safeSubscriptions
      .map(s => {
        const planCycle = getPlanCycleFromProductId(s.productId);

        if (!planCycle) {
          if (__DEV__) {
            console.log('[IAP] ignoring unknown subscription productId', {
              productId: s.productId,
            });
          }
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

    if (__DEV__) {
      console.log('[IAP] mapped store products', {
        rawCount: safeSubscriptions.length,
        mappedCount: mapped.length,
        mapped,
      });
    }

    setProducts(mapped);
  }, [safeSubscriptions]);

  // Surface "no plans" only after loading has actually finished.
  useEffect(() => {
    if (loadingProducts) {
      return;
    }

    if (!connected) {
      return;
    }

    if (error) {
      return;
    }

    if (safeSubscriptions.length === 0) {
      if (__DEV__) {
        console.warn(
          '[IAP] no subscription plans returned from store after loading finished',
        );
      }

      setError('No subscription plans are available right now.');
    }
  }, [loadingProducts, connected, error, safeSubscriptions]);

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

    if (__DEV__) {
      console.log('[IAP] currentPurchase matched resolver', {
        productId: currentPurchase.productId,
      });
    }

    purchaseResolverRef.current = null;
    resolver.resolve(currentPurchase);
  }, [currentPurchase]);

  useEffect(() => {
    if (!currentPurchaseError || !purchaseResolverRef.current) {
      return;
    }

    const resolver = purchaseResolverRef.current;

    if (__DEV__) {
      console.warn('[IAP] currentPurchaseError', currentPurchaseError);
    }

    purchaseResolverRef.current = null;
    clearCurrentPurchaseError();

    const err =
      currentPurchaseError.code === 'E_USER_CANCELLED'
        ? new Error('USER_CANCELLED')
        : new Error(currentPurchaseError.message ?? 'Purchase failed');

    resolver.reject(err);
  }, [currentPurchaseError, clearCurrentPurchaseError]);

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
        if (__DEV__) {
          console.log('[IAP] purchase start', {
            productId,
            clubId,
            connected,
            subscriptionCount: safeSubscriptions.length,
            subscriptions: safeSubscriptions.map(s => ({
              productId: s.productId,
              title: (s as any).title,
              subscriptionOfferDetails:
                (s as any).subscriptionOfferDetails ?? [],
            })),
          });
        }

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

        const androidSub = safeSubscriptions.find(
          s => s.productId === productId,
        ) as SubscriptionAndroid | undefined;

        const request = buildSubscriptionRequest(productId, androidSub);

        if (__DEV__) {
          console.log('[IAP] requestSubscription payload ready', {
            platform: Platform.OS,
            productId,
            request,
          });
        }

        await requestSubscription(request as any);

        if (__DEV__) {
          console.log(
            '[IAP] requestSubscription returned; waiting for purchase event',
          );
        }

        const storePurchase = await storePromise;

        if (__DEV__) {
          console.log('[IAP] store purchase received', {
            productId: storePurchase.productId,
            transactionId: storePurchase.transactionId,
          });
        }

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
      safeSubscriptions,
      requestSubscription,
      finishTransaction,
      clearCurrentPurchase,
      clearCurrentPurchaseError,
    ],
  );

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
        if (__DEV__) {
          console.log('[IAP] restore start', {clubId});
        }

        const purchasesResult = await iapGetAvailablePurchases();
        const allPurchases = Array.isArray(purchasesResult)
          ? purchasesResult
          : [];

        const subPurchases = allPurchases.filter(p =>
          ALL_SUBSCRIPTION_SKUS.includes(p.productId),
        );

        if (__DEV__) {
          console.log('[IAP] restore purchases found', {
            allCount: allPurchases.length,
            subCount: subPurchases.length,
          });
        }

        if (subPurchases.length === 0) {
          return {
            status: null,
            verifiedCount: 0,
            verifyFailed: false,
          };
        }

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
