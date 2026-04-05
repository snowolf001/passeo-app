import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {Club, ClubSettings, Membership} from '../types';
import {getMembershipById} from '../services/api/membershipApi';
import {
  getStoredMembershipSession,
  saveStoredMembershipSession,
  clearStoredMembershipSession,
  StoredMembershipSession,
} from '../storage/membershipSessionStorage';

export type CheckInEvent = {
  membershipId: string;
  sessionId: string;
  checkedInAt: string;
};

type AppContextValue = {
  currentMembership: Membership | null;
  currentClub: Club | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  decrementCurrentMembershipCredits: (amount: number) => void;
  setCurrentMembershipCredits: (credits: number) => void;
  updateCurrentClubSettings: (settings: ClubSettings) => void;
  lastCheckInEvent: CheckInEvent | null;
  publishCheckInEvent: (event: CheckInEvent) => void;
  setActiveMembershipSession: (
    session: StoredMembershipSession,
  ) => Promise<void>;
  clearMembershipSession: () => Promise<void>;
};

const AppContext = createContext<AppContextValue>({
  currentMembership: null,
  currentClub: null,
  isLoading: true,
  refresh: async () => {},
  decrementCurrentMembershipCredits: () => {},
  setCurrentMembershipCredits: () => {},
  updateCurrentClubSettings: () => {},
  lastCheckInEvent: null,
  publishCheckInEvent: () => {},
  setActiveMembershipSession: async () => {},
  clearMembershipSession: async () => {},
});

export const AppProvider = ({children}: {children: ReactNode}) => {
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

  const setCurrentMembershipCredits = useCallback((credits: number) => {
    setCurrentMembership(prev => (prev ? {...prev, credits} : prev));
  }, []);

  const updateCurrentClubSettings = useCallback((settings: ClubSettings) => {
    setCurrentClub(prev => (prev ? {...prev, settings} : prev));
  }, []);

  const publishCheckInEvent = useCallback((event: CheckInEvent) => {
    setLastCheckInEvent(event);
  }, []);

  // Load membership from backend using a stored membershipId.
  const loadFromStorage = useCallback(async () => {
    setIsLoading(true);
    try {
      const stored = await getStoredMembershipSession();
      if (!stored) {
        setCurrentMembership(null);
        setCurrentClub(null);
        return;
      }

      const result = await getMembershipById(stored.membershipId);

      const membership: Membership = {
        id: result.membership.membershipId,
        userId: result.membership.userId,
        clubId: result.membership.clubId,
        userName: result.membership.userName,
        role: result.membership.role as Membership['role'],
        credits: result.membership.credits,
        recoveryCode: '',
        memberCode: '',
      };

      const club: Club = {
        id: result.club.clubId,
        name: result.club.name,
        joinCode: result.club.joinCode ?? '',
        createdBy: result.membership.userId,
      };

      setCurrentMembership(membership);
      setCurrentClub(club);
    } catch {
      // Invalid or not found — clear stale storage and show join flow
      await clearStoredMembershipSession();
      setCurrentMembership(null);
      setCurrentClub(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh revalidates the currently stored session against the backend.
  const refresh = useCallback(async () => {
    await loadFromStorage();
  }, [loadFromStorage]);

  // Called after successful join/create to persist session and update state immediately.
  const setActiveMembershipSession = useCallback(
    async (session: StoredMembershipSession) => {
      await saveStoredMembershipSession(session);
      // Reload from backend to get full membership + club shape
      await loadFromStorage();
    },
    [loadFromStorage],
  );

  // Clear local session — returns app to JoinOrCreate flow.
  const clearMembershipSession = useCallback(async () => {
    await clearStoredMembershipSession();
    setCurrentMembership(null);
    setCurrentClub(null);
  }, []);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <AppContext.Provider
      value={{
        currentMembership,
        currentClub,
        isLoading,
        refresh,
        decrementCurrentMembershipCredits,
        setCurrentMembershipCredits,
        updateCurrentClubSettings,
        lastCheckInEvent,
        publishCheckInEvent,
        setActiveMembershipSession,
        clearMembershipSession,
      }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
