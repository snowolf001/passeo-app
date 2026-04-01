// src/services/entitlementService.ts
import {
  clearEntitlementData,
  getDevForceProEnabled,
  getIsPro,
  setDevForceProEnabled,
  setIsPro,
} from './entitlement';

export const entitlementService = {
  /**
   * Cached/local entitlement snapshot only.
   * Do NOT use this as the source of truth for critical Pro checks.
   * Critical checks must use syncProStatusFromStore(...).
   */
  async getIsPro(): Promise<boolean> {
    return getIsPro();
  },

  async setIsPro(value: boolean): Promise<void> {
    return setIsPro(value);
  },

  // DEV only
  async getDevForceProEnabled(): Promise<boolean> {
    return getDevForceProEnabled();
  },

  // DEV only
  async setDevForceProEnabled(value: boolean): Promise<void> {
    await setDevForceProEnabled(value);
    console.log(`[Entitlement] Dev Force Pro set to: ${value}`);
  },

  async clearEntitlementData(): Promise<void> {
    return clearEntitlementData();
  },
};
