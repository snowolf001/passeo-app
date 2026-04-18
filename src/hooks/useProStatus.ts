import {useState, useEffect, useCallback} from 'react';
import {AppState} from 'react-native';
import {
  getIsPro,
  getPlan,
  setPlan as setPlanStorage,
  EntitlementPlan,
} from '../services/entitlement';

/**
 * @deprecated Do NOT use this hook to gate Pro features.
 *
 * useProStatus reads `isPro` from a local AsyncStorage cache. That cache may
 * be stale and does NOT represent the club-level subscription status from the
 * backend. It also can never reflect another member's purchase for the same
 * club.
 *
 * The backend club subscription status is the source of truth:
 *   import {useClubSubscription} from './useClubSubscription';
 *   const { status } = useClubSubscription(clubId);
 *   const isPro = status?.isPro ?? false;
 *
 * Store purchase history (and therefore this hook) is only relevant during
 * the purchase flow and restore/relink flows — never for normal Pro gating.
 */
export function useProStatus() {
  const [isPro, setIsProState] = useState(false);
  const [plan, setPlanState] = useState<EntitlementPlan>('free');
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      const [status, currentPlan] = await Promise.all([getIsPro(), getPlan()]);
      setIsProState(status);
      setPlanState(currentPlan);
    } catch (error) {
      console.error('[useProStatus] Error fetching Pro status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setPlan = useCallback(
    async (newPlan: EntitlementPlan) => {
      await setPlanStorage(newPlan);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    refresh();

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refresh();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refresh]);

  return {
    isPro,
    plan,
    isLoading,
    refresh,
    setPlan,
  };
}
