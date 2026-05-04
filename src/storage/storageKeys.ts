// src/storage/storageKeys.ts
//
// Centralized registry of all AsyncStorage keys used by this app.
//
// Rules:
//  - Identity keys (IDENTITY_KEYS) must be removed on account deletion.
//  - Preference keys (theme, locale, onboarding) must NOT be removed on deletion.
//  - Entitlement/Pro cache keys are managed by clearEntitlementData() in
//    src/services/entitlement.ts and are excluded here to avoid duplication.

export const STORAGE_KEYS = {
  // ── Identity / session (cleared on account deletion) ──────────────────────
  USER_IDENTITY: 'CLUB_APP_USER_IDENTITY',
  MEMBERSHIP_SESSION: 'CLUB_APP_MEMBERSHIP_SESSION',
} as const;

/**
 * The exact set of keys removed during account deletion.
 * Intentionally scoped — only identity data, not app preferences.
 */
export const IDENTITY_KEYS: string[] = [
  STORAGE_KEYS.USER_IDENTITY,
  STORAGE_KEYS.MEMBERSHIP_SESSION,
];
