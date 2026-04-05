import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'CLUB_APP_MEMBERSHIP_SESSION';

export type StoredMembershipSession = {
  membershipId: string;
  clubId: string;
  userId: string;
};

export async function getStoredMembershipSession(): Promise<StoredMembershipSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.membershipId === 'string' &&
      typeof parsed.clubId === 'string' &&
      typeof parsed.userId === 'string'
    ) {
      return parsed as StoredMembershipSession;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveStoredMembershipSession(
  session: StoredMembershipSession,
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // best-effort
  }
}

export async function clearStoredMembershipSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}
