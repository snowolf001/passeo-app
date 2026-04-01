import {useState, useEffect, useCallback} from 'react';
import {AppState} from 'react-native';
import {getIsPro} from '../services/entitlement';

export function useProStatus() {
  const [isPro, setIsProState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      const status = await getIsPro();
      setIsProState(status);
    } catch (error) {
      console.error('[useProStatus] Error fetching Pro status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refresh(); // 👈 回到前台自动同步
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refresh]);

  return {
    isPro,
    isLoading,
    refresh,
  };
}
