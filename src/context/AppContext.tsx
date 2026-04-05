import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {Club, ClubSettings, Membership} from '../types';
import {getMyMembership} from '../services/api/membershipApi';
import {getClub as apiGetClub} from '../services/api/clubApi';

// Seed club ID – replace with a real lookup / stored value once auth is added.
const SEED_CLUB_ID = '22222222-2222-2222-2222-222222222222';

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

  const load = useCallback(async () => {
    console.log('[AppContext] load() START — SEED_CLUB_ID:', SEED_CLUB_ID);
    setIsLoading(true);
    try {
      console.log('[AppContext] calling getMyMembership...');
      const apiMembership = await getMyMembership(SEED_CLUB_ID);
      console.log(
        '[AppContext] getMyMembership OK:',
        JSON.stringify(apiMembership),
      );

      // Map backend shape (membershipId) → app Membership type (id)
      const membership: Membership = {
        id: apiMembership.membershipId,
        userId: apiMembership.userId,
        clubId: apiMembership.clubId,
        role: apiMembership.role,
        credits: apiMembership.credits,
        recoveryCode: '',
        memberCode: '',
      };
      console.log(
        '[AppContext] mapped membership id:',
        membership.id,
        'clubId:',
        membership.clubId,
      );

      console.log('[AppContext] calling getClub for:', membership.clubId);
      const apiClub = await apiGetClub(membership.clubId);
      console.log('[AppContext] getClub OK:', JSON.stringify(apiClub));

      const club: Club = {
        id: apiClub.clubId,
        name: apiClub.name,
        joinCode: apiClub.joinCode ?? '',
        createdBy: membership.userId,
      };

      setCurrentMembership(membership);
      setCurrentClub(club);
      console.log('[AppContext] load() DONE — membership and club set');
    } catch (err: any) {
      console.warn('[AppContext] load() failed:', err?.message ?? String(err));
      setCurrentMembership(null);
      setCurrentClub(null);
    } finally {
      setIsLoading(false);
      console.log('[AppContext] load() finally — isLoading set to false');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppContext.Provider
      value={{
        currentMembership,
        currentClub,
        isLoading,
        refresh: load,
        decrementCurrentMembershipCredits,
        setCurrentMembershipCredits,
        updateCurrentClubSettings,
        lastCheckInEvent,
        publishCheckInEvent,
      }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
