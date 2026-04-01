// src/utils/tips.ts
/**
 * Helper functions for managing one-time tips using AsyncStorage
 * Used for page/photo delete guidance
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PAGE_DELETE_TIP_KEY = 'page_delete_tip_seen';

/**
 * Check if user has seen the page delete tip
 */
export async function getHasSeenPageDeleteTip(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(PAGE_DELETE_TIP_KEY);
    return value === '1';
  } catch (error) {
    console.warn('Failed to read delete tip status:', error);
    return false; // Fail silently, don't show tip this session
  }
}

/**
 * Mark the page delete tip as seen
 */
export async function setHasSeenPageDeleteTip(): Promise<void> {
  try {
    await AsyncStorage.setItem(PAGE_DELETE_TIP_KEY, '1');
  } catch (error) {
    console.warn('Failed to save delete tip status:', error);
  }
}
