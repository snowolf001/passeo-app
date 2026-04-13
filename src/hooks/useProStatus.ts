import {useState, useEffect, useCallback} from 'react';
import {AppState} from 'react-native';
import {
  getIsPro,
  getPlan,
  setPlan as setPlanStorage,
  EntitlementPlan,
} from '../services/entitlement';

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
