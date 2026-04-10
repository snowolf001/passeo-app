/**
 * Lightweight first-party analytics helper for closed testing.
 *
 * Privacy rules enforced here:
 *  - Only whitelisted event names are sent.
 *  - Only whitelisted fields are included in the payload.
 *  - Raw member names, join codes, recovery codes, free text, etc. are NEVER sent.
 *  - clubId / sessionId ARE sent (backend will one-way hash them before storage).
 *  - All failures are silently swallowed (or dev-logged).
 */

import {Platform} from 'react-native';
import {apiRequest} from '../services/api/apiClient';
import {APP_CONFIG} from '../config/appConfig';

// ─── Allowlist ────────────────────────────────────────────────────────────────

export type EventName =
  | 'app_opened'
  | 'club_created'
  | 'join_club_attempt'
  | 'join_club_success'
  | 'join_club_failed'
  | 'recovery_attempt'
  | 'recovery_success'
  | 'recovery_failed'
  | 'session_created'
  | 'checkin_attempt'
  | 'checkin_success'
  | 'checkin_failed'
  | 'manual_checkin_success'
  | 'manual_checkin_failed'
  | 'export_pdf_attempt'
  | 'export_pdf_success'
  | 'export_pdf_failed'
  | 'adjust_credits_success'
  | 'adjust_credits_failed';

export type TrackEventParams = {
  eventName: EventName;
  success?: boolean;
  /** Backend error code only — never a user-visible message. */
  errorCode?: string;
  sourceScreen?: string;
  /** Raw clubId — backend hashes before storage. */
  clubId?: string;
  /** Raw sessionId — backend hashes before storage. */
  sessionId?: string;
};

// ─── Implementation ───────────────────────────────────────────────────────────

export function trackEvent(params: TrackEventParams): void {
  // Build a minimal, safe payload — only whitelisted fields.
  const payload: Record<string, unknown> = {
    eventName: params.eventName,
    platform: Platform.OS,
    appVersion: APP_CONFIG.VERSION,
  };

  if (params.success !== undefined) payload.success = params.success;
  if (params.errorCode) payload.errorCode = params.errorCode;
  if (params.sourceScreen) payload.sourceScreen = params.sourceScreen;
  if (params.clubId) payload.clubId = params.clubId;
  if (params.sessionId) payload.sessionId = params.sessionId;

  // Fire-and-forget — never await, never throw.
  apiRequest<unknown>('/api/track', {method: 'POST', body: payload}).catch(
    err => {
      if (__DEV__) {
        console.log('[analytics] track failed (ignored):', err?.message ?? err);
      }
    },
  );
}
