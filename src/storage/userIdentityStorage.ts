// src/storage/userIdentityStorage.ts
//
// Stores the user's identity (membershipId + userId) independently of the
// active membership session.  Unlike the membership session, this key is NOT
// cleared when the user leaves a club — it is only removed on successful
// account deletion.  This allows the Delete Account flow to work even after
// the user has left all clubs.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'CLUB_APP_USER_IDENTITY';

export type StoredUserIdentity = {
  membershipId: string;
  userId: string;
};

export async function getStoredUserIdentity(): Promise<StoredUserIdentity | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.membershipId === 'string' &&
      typeof parsed.userId === 'string'
    ) {
      return parsed as StoredUserIdentity;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveStoredUserIdentity(
  identity: StoredUserIdentity,
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // best-effort
  }
}

export async function clearStoredUserIdentity(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}
