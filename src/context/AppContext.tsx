import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {Club, Membership, User} from '../types';
import {membershipService} from '../services/membershipService';
import {clubService} from '../services/clubService';
import {CURRENT_USER_ID} from '../data/mockData';
import {db} from '../data/mockData';

// ────────────────────────────────────────────────────────────
// App Context
// Holds the current user, their membership, and their club.
// Any screen can call useApp() to access this without prop drilling.
// ────────────────────────────────────────────────────────────

type AppContextValue = {
  currentUser: User | null;
  currentMembership: Membership | null;
  currentClub: Club | null;
  isLoading: boolean;
  /** Re-fetch membership state (e.g. after joining or creating a club). */
  refresh: () => Promise<void>;
  /**
   * Instantly decrement the in-context credit balance without re-fetching
   * anything. Use this after a successful self check-in so the UI updates
   * immediately and no async work can interrupt an ongoing animation.
   */
  decrementCurrentMembershipCredits: (amount: number) => void;
};

const AppContext = createContext<AppContextValue>({
  currentUser: null,
  currentMembership: null,
  currentClub: null,
  isLoading: true,
  refresh: async () => {},
  decrementCurrentMembershipCredits: () => {},
});

export const AppProvider = ({children}: {children: ReactNode}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentMembership, setCurrentMembership] = useState<Membership | null>(
    null,
  );
  const [currentClub, setCurrentClub] = useState<Club | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const decrementCurrentMembershipCredits = useCallback((amount: number) => {
    setCurrentMembership(prev =>
      prev ? {...prev, credits: Math.max(0, prev.credits - amount)} : prev,
    );
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    const user = db.getUsers().find(u => u.id === CURRENT_USER_ID) ?? null;
    const membership = await membershipService.getCurrentMembership();
    const club = membership
      ? await clubService.getClub(membership.clubId)
      : null;

    setCurrentUser(user);
    setCurrentMembership(membership);
    setCurrentClub(club);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        currentMembership,
        currentClub,
        isLoading,
        refresh: load,
        decrementCurrentMembershipCredits,
      }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
