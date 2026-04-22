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

function getAndroidOfferDetails(sub: SubscriptionAndroid | undefined): any[] {
  const details = (sub as any)?.subscriptionOfferDetails;
  return Array.isArray(details) ? details : [];
}

function extractLocalizedPrice(sub: any): string {
  if (typeof sub?.localizedPrice === 'string' && sub.localizedPrice) {
    return sub.localizedPrice;
  }

  const firstOffer = Array.isArray(sub?.subscriptionOfferDetails)
    ? sub.subscriptionOfferDetails[0]
    : null;

  const phase = firstOffer?.pricingPhases?.pricingPhaseList?.[0];

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
    const offerDetails = getAndroidOfferDetails(androidSub);
    const offerToken = offerDetails[0]?.offerToken ?? '';

    if (__DEV__) {
      console.log('[IAP] buildSubscriptionRequest(android)', {
        productId,
        hasAndroidSub: !!androidSub,
        offerTokenPresent: !!offerToken,
        offerCount: offerDetails.length,
        subscriptionOfferDetails: offerDetails,
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

export function useClubProPurchase(options?: {
  skip?: boolean;
}): UseClubProPurchaseResult {
  const skip = options?.skip ?? false;

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

  const safeSubscriptions = useMemo(
    () => (Array.isArray(subscriptions) ? subscriptions : []),
    [subscriptions],
  );

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(!skip);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const loadAttemptRef = useRef(0);

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

  useEffect(() => {
    if (skip) {
      setLoadingProducts(false);
      return;
    }

    if (initConnectionError) {
      if (__DEV__) {
        console.warn('[IAP] initConnectionError:', initConnectionError);
      }
      setProducts([]);
      setLoadingProducts(false);
      setError('Could not connect to the store. Please try again.');
      return;
    }

    if (!connected) {
      if (__DEV__) {
        console.log('[IAP] waiting for store connection...');
      }
      setLoadingProducts(true);
      return;
    }

    if (safeSubscriptions.length > 0) {
      if (__DEV__) {
        console.log('[IAP] subscriptions already available in context', {
          count: safeSubscriptions.length,
        });
      }
      setLoadingProducts(false);
      return;
    }

    let cancelled = false;
    const attemptId = ++loadAttemptRef.current;

    if (__DEV__) {
      console.log('[IAP] loading subscriptions', {
        skus: ALL_SUBSCRIPTION_SKUS,
        attemptId,
      });
    }

    setLoadingProducts(true);
    setError(null);

    const timeoutId = setTimeout(() => {
      if (cancelled || loadAttemptRef.current !== attemptId) {
        return;
      }

      if (__DEV__) {
        console.warn('[IAP] loading subscriptions timed out after 10s');
      }

      setLoadingProducts(false);
      setError('Loading plans timed out. Please try again.');
    }, 10_000);

    getSubscriptions({skus: ALL_SUBSCRIPTION_SKUS})
      .then(result => {
        if (__DEV__) {
          console.log('[IAP] getSubscriptions resolved', {
            resultCount: Array.isArray(result) ? result.length : null,
          });
        }
      })
      .catch(e => {
        if (cancelled || loadAttemptRef.current !== attemptId) {
          return;
        }

        const msg = e?.message ?? 'Failed to load subscription plans.';

        if (__DEV__) {
          console.warn('[IAP] getSubscriptions promise rejection:', msg, e);
        }

        setError(msg);
      })
      .finally(() => {
        if (cancelled || loadAttemptRef.current !== attemptId) {
          return;
        }

        clearTimeout(timeoutId);

        if (__DEV__) {
          console.log('[IAP] getSubscriptions call finished');
        }

        setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    connected,
    initConnectionError,
    safeSubscriptions.length,
    skip,
    getSubscriptions,
  ]);

  useEffect(() => {
    if (skip) {
      setProducts([]);
      return;
    }

    try {
      const mapped: StoreProduct[] = safeSubscriptions
        .map(s => {
          try {
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
          } catch (itemErr: any) {
            if (__DEV__) {
              console.error('[IAP] map item error', itemErr);
            }
            return null;
          }
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

      if (safeSubscriptions.length > 0) {
        setLoadingProducts(false);
      }
    } catch (e: any) {
      if (__DEV__) {
        console.error('[IAP] mapped effect global error', e);
      }
      setProducts([]);
      setLoadingProducts(false);
    }
  }, [safeSubscriptions, skip]);

  useEffect(() => {
    if (skip) return;
    if (loadingProducts) return;
    if (!connected) return;
    if (error) return;

    if (safeSubscriptions.length === 0) {
      if (__DEV__) {
        console.warn(
          '[IAP] no subscription plans returned from store after loading finished',
        );
      }

      setError('No subscription plans are available right now.');
    }
  }, [loadingProducts, connected, error, safeSubscriptions, skip]);

  useEffect(() => {
    if (skip) return;

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
  }, [currentPurchase, skip]);

  useEffect(() => {
    if (skip) return;

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
  }, [currentPurchaseError, clearCurrentPurchaseError, skip]);

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

      if (!clubId) {
        throw new Error('Missing clubId');
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
        // Clear the stale purchase from useIAP context so a retry doesn't
        // match the previous purchase in the currentPurchase effect.
        clearCurrentPurchase();
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

      if (!clubId) {
        throw new Error('Missing clubId');
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
