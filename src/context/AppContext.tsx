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

export type CheckInEvent = {
  membershipId: string;
  sessionId: string;
  checkedInAt: string;
};

type AppContextValue = {
  currentUser: User | null;
  currentMembership: Membership | null;
  currentClub: Club | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  decrementCurrentMembershipCredits: (amount: number) => void;

  /**
   * Last successful check-in event.
   * Used for lightweight cross-screen UI sync without full refresh().
   */
  lastCheckInEvent: CheckInEvent | null;

  /**
   * Emit a successful check-in event.
   * Also updates currentMembership credits immediately if the checked-in
   * membership is the current user's membership.
   */
  publishCheckInEvent: (event: CheckInEvent) => void;
};

const AppContext = createContext<AppContextValue>({
  currentUser: null,
  currentMembership: null,
  currentClub: null,
  isLoading: true,
  refresh: async () => {},
  decrementCurrentMembershipCredits: () => {},
  lastCheckInEvent: null,
  publishCheckInEvent: () => {},
});

export const AppProvider = ({children}: {children: ReactNode}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentMembership, setCurrentMembership] = useState<Membership | null>(
    null,
  );
  const [currentClub, setCurrentClub] = useState<Club | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastCheckInEvent, setLastCheckInEvent] = useState<CheckInEvent | null>(
    null,
  );

  const decrementCurrentMembershipCredits = useCallback((amount: number) => {
    setCurrentMembership(prev =>
      prev ? {...prev, credits: Math.max(0, prev.credits - amount)} : prev,
    );
  }, []);

  const publishCheckInEvent = useCallback((event: CheckInEvent) => {
    setLastCheckInEvent(event);

    setCurrentMembership(prev => {
      if (!prev) {
        return prev;
      }

      if (prev.id !== event.membershipId) {
        return prev;
      }

      return {
        ...prev,
        credits: Math.max(0, prev.credits - 1),
      };
    });
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
        lastCheckInEvent,
        publishCheckInEvent,
      }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
