// src/services/entitlement.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '../config/appConfig';

const DEV_STORAGE_KEY = 'dev_force_pro_enabled';
const PLAN_STORAGE_KEY = 'dev_entitlement_plan';

export type EntitlementPlan = 'free' | 'pro_monthly' | 'pro_yearly';

/**
 * DEV ONLY
 */
export async function getDevForceProEnabled(): Promise<boolean> {
  if (!__DEV__) return false;

  try {
    const value = await AsyncStorage.getItem(DEV_STORAGE_KEY);
    return value === 'true';
  } catch (error) {
    console.error('[Dev] Error reading devForcePro:', error);
    return false;
  }
}

export async function setDevForceProEnabled(value: boolean): Promise<void> {
  if (!__DEV__) return;

  try {
    await AsyncStorage.setItem(DEV_STORAGE_KEY, value ? 'true' : 'false');
    console.log('[Dev] Force Pro set to:', value);
  } catch (error) {
    console.error('[Dev] Error setting devForcePro:', error);
  }
}

export const setDevForcePro = setDevForceProEnabled;

/**
 * Cached/local entitlement snapshot only.
 *
 * IMPORTANT:
 * - This is NOT the source of truth.
 * - Do NOT use this for critical Pro gating.
 * - Do NOT use this to decide premium export behavior.
 * - Critical checks must use syncProStatusFromStore(...).
 */
export async function getIsPro(): Promise<boolean> {
  try {
    if (__DEV__) {
      const forcePro = await getDevForceProEnabled();
      if (forcePro) {
        console.log('[Dev] Force Pro enabled');
        return true;
      }
    }

    const value = await AsyncStorage.getItem(STORAGE_KEYS.IS_PRO);
    return value === 'true';
  } catch (error) {
    console.error('[Entitlement] Error reading isPro:', error);
    return false;
  }
}

/**
 * Cache setter only.
 * Never treat this write as final store truth.
 */
export async function setIsPro(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.IS_PRO, value ? 'true' : 'false');

    if (__DEV__) {
      console.log('[Entitlement] Pro cache set to:', value);
    }
  } catch (error) {
    console.error('[Entitlement] Error setting isPro:', error);
  }
}

/**
 * Clear all local entitlement/cache state.
 */
export async function clearEntitlementData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.IS_PRO);
    await AsyncStorage.removeItem(DEV_STORAGE_KEY);
    await AsyncStorage.removeItem(PLAN_STORAGE_KEY);

    console.log('[Entitlement] Cleared all entitlement data');
  } catch (error) {
    console.error('[Entitlement] Error clearing data:', error);
  }
}

/**
 * Returns the current plan.
 * Production: always 'free' (billing not wired up yet).
 * DEV: reads from AsyncStorage (defaults to 'free').
 */
export async function getPlan(): Promise<EntitlementPlan> {
  if (!__DEV__) {
    return 'free';
  }
  try {
    const value = await AsyncStorage.getItem(PLAN_STORAGE_KEY);
    if (value === 'pro_monthly' || value === 'pro_yearly') {
      return value;
    }
    return 'free';
  } catch {
    return 'free';
  }
}

/**
 * DEV ONLY – sets the plan and syncs isPro to AsyncStorage.
 */
export async function setPlan(plan: EntitlementPlan): Promise<void> {
  if (!__DEV__) {
    return;
  }
  try {
    const isPro = plan !== 'free';
    await AsyncStorage.setItem(PLAN_STORAGE_KEY, plan);
    await AsyncStorage.setItem(STORAGE_KEYS.IS_PRO, isPro ? 'true' : 'false');
    await AsyncStorage.setItem(DEV_STORAGE_KEY, isPro ? 'true' : 'false');
  } catch (error) {
    console.error('[Entitlement] Error setting plan:', error);
  }
}
