import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import {AppState, AppStateStatus} from 'react-native';
import {Club, ClubSettings, Membership} from '../types';
import {getMembershipById} from '../services/api/membershipApi';
import {setActiveMemberId} from '../config/api';
import {
  getStoredMembershipSession,
  saveStoredMembershipSession,
  clearStoredMembershipSession,
  StoredMembershipSession,
} from '../storage/membershipSessionStorage';
import {
  getStoredUserIdentity,
  saveStoredUserIdentity,
  clearStoredUserIdentity,
  StoredUserIdentity,
} from '../storage/userIdentityStorage';
import {clearEntitlementData} from '../services/entitlement';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {IDENTITY_KEYS} from '../storage/storageKeys';

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
  // Identity kept independently of the active club session — survives Leave Club.
  // Used by the Delete Account flow to authenticate even with no active membership.
  storedUserIdentity: StoredUserIdentity | null;
  clearUserIdentity: () => Promise<void>;
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
  storedUserIdentity: null,
  clearUserIdentity: async () => {},
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
  const [storedUserIdentity, setStoredUserIdentity] =
    useState<StoredUserIdentity | null>(null);

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
        // Still load user identity so Delete Account is accessible from JoinOrCreate.
        const identity = await getStoredUserIdentity();
        setStoredUserIdentity(identity);
        return;
      }

      // Set the active member ID before the API call so getApiHeaders()
      // includes x-member-id on the GET /memberships/:id request.
      setActiveMemberId(stored.membershipId);

      const result = await getMembershipById(stored.membershipId);

      const membership: Membership = {
        id: result.membership.membershipId,
        userId: result.membership.userId,
        clubId: result.membership.clubId,
        userName: result.membership.userName,
        role: result.membership.role as Membership['role'],
        credits: result.membership.credits,
        recoveryCode: result.membership.recoveryCode,
        memberCode: '',
      };

      const club: Club = {
        id: result.club.clubId,
        name: result.club.name,
        joinCode: result.club.joinCode ?? '',
        createdBy: result.membership.userId,
      };

      setCurrentMembership(membership);
      setActiveMemberId(membership.id);
      setCurrentClub(club);

      // Keep user identity in sync with the current membership.
      const identity: StoredUserIdentity = {
        membershipId: membership.id,
        userId: membership.userId,
      };
      await saveStoredUserIdentity(identity);
      setStoredUserIdentity(identity);
    } catch {
      // Invalid or not found — clear stale storage and show join flow
      await clearStoredMembershipSession();
      setActiveMemberId(null);
      setCurrentMembership(null);
      setCurrentClub(null);
      // Keep user identity so Delete Account remains accessible.
      const identity = await getStoredUserIdentity();
      setStoredUserIdentity(identity);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh revalidates the currently stored session against the backend.
  // Unlike loadFromStorage, this does NOT set isLoading=true so the navigation
  // stack is not destroyed while the check is in progress.
  const refresh = useCallback(async () => {
    try {
      const stored = await getStoredMembershipSession();
      if (!stored) return;

      setActiveMemberId(stored.membershipId);
      const result = await getMembershipById(stored.membershipId);

      const membership: Membership = {
        id: result.membership.membershipId,
        userId: result.membership.userId,
        clubId: result.membership.clubId,
        userName: result.membership.userName,
        role: result.membership.role as Membership['role'],
        credits: result.membership.credits,
        recoveryCode: result.membership.recoveryCode,
        memberCode: '',
      };

      setCurrentMembership(membership);
      setActiveMemberId(membership.id);
      setCurrentClub({
        id: result.club.clubId,
        name: result.club.name,
        joinCode: result.club.joinCode ?? '',
        createdBy: result.membership.userId,
      });
    } catch {
      // Silently ignore transient errors — don't clear the session on a
      // background refresh failure (that would log the user out unexpectedly).
    }
  }, []);

  // Called after successful join/create to persist session and update state immediately.
  const setActiveMembershipSession = useCallback(
    async (session: StoredMembershipSession) => {
      await saveStoredMembershipSession(session);
      // Persist user identity independently so it survives Leave Club.
      await saveStoredUserIdentity({
        membershipId: session.membershipId,
        userId: session.userId,
      });
      setStoredUserIdentity({
        membershipId: session.membershipId,
        userId: session.userId,
      });
      // Reload from backend to get full membership + club shape
      await loadFromStorage();
    },
    [loadFromStorage],
  );

  // Clear local session — returns app to JoinOrCreate flow.
  // Does NOT clear userIdentity — Delete Account remains accessible.
  const clearMembershipSession = useCallback(async () => {
    await clearStoredMembershipSession();
    setActiveMemberId(null);
    setCurrentMembership(null);
    setCurrentClub(null);
  }, []);

  // Called only on successful account deletion — removes all identity and
  // account data while preserving unrelated app preferences (theme, etc.).
  const clearUserIdentity = useCallback(async () => {
    // 1. Remove identity keys precisely — do NOT use getAllKeys/multiRemove(all)
    //    to avoid destroying unrelated preferences like theme or onboarding flags.
    try {
      await AsyncStorage.multiRemove(IDENTITY_KEYS);
    } catch (err) {
      // Fallback: remove each key individually so a single failure does not
      // block the others.
      console.warn('[clearUserIdentity] multiRemove failed, falling back', err);
      for (const key of IDENTITY_KEYS) {
        try {
          await AsyncStorage.removeItem(key);
        } catch (innerErr) {
          console.warn(
            '[clearUserIdentity] removeItem failed for key:',
            key,
            innerErr,
          );
        }
      }
    }

    // 2. Clear the Pro/entitlement cache (managed by its own key registry).
    await clearEntitlementData();

    // 3. Clear the active member ID header from the API config.
    setActiveMemberId(null);

    // 4. Reset all in-memory state.
    setCurrentMembership(null);
    setCurrentClub(null);
    setStoredUserIdentity(null);
    setLastCheckInEvent(null);
  }, []);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // Refresh membership/role when app comes back to foreground
  useEffect(() => {
    const appStateRef = {current: AppState.currentState};

    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextState === 'active'
        ) {
          void refresh();
        }
        appStateRef.current = nextState;
      },
    );

    return () => subscription.remove();
  }, [refresh]);

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
        storedUserIdentity,
        clearUserIdentity,
      }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
