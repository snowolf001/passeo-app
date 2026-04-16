// src/hooks/useClubSubscription.ts
//
// Fetches and caches the current club's backend subscription status.
// All Pro-gated UI should read from this hook — never derive isPro locally.
//
// Usage:
//   const {status, loading, error, refresh} = useClubSubscription(clubId);

import {useState, useCallback, useEffect} from 'react';
import {useApp} from '../context/AppContext';
import {getClubSubscriptionStatus} from '../services/api/subscriptionApi';
import {ClubSubscriptionStatus} from '../types/subscription';

export type UseClubSubscriptionResult = {
  /** Latest subscription status from backend. Null until first load. */
  status: ClubSubscriptionStatus | null;
  loading: boolean;
  error: string | null;
  /** Manually re-fetch. Call after purchase or restore. */
  refresh: () => Promise<void>;
};

export function useClubSubscription(
  clubId?: string,
): UseClubSubscriptionResult {
  const {currentClub} = useApp();

  const effectiveClubId = clubId ?? currentClub?.id ?? null;

  const [status, setStatus] = useState<ClubSubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!effectiveClubId) {
      setStatus(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getClubSubscriptionStatus(effectiveClubId);
      setStatus(result);
    } catch (e: any) {
      setError(e?.message || 'Unable to load subscription status');
    } finally {
      setLoading(false);
    }
  }, [effectiveClubId]);

  useEffect(() => {
    setStatus(null);
    setError(null);

    if (!effectiveClubId) {
      setLoading(false);
      return;
    }

    void refresh();
  }, [effectiveClubId, refresh]);

  return {status, loading, error, refresh};
}
