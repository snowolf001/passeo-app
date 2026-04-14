// src/services/api/subscriptionApi.ts
//
// Backend API calls for club subscription status and purchase verification.
// All requests go through apiClient which automatically attaches
// x-api-key and x-member-id headers.

import {apiRequest} from './apiClient';
import {
  ClubSubscriptionStatus,
  VerifyPurchasePayload,
} from '../../types/subscription';

/**
 * Fetch the current club's subscription status from the backend.
 *
 * GET /api/subscriptions/status?clubId=...
 */
export async function getClubSubscriptionStatus(
  clubId: string,
): Promise<ClubSubscriptionStatus> {
  return apiRequest<ClubSubscriptionStatus>(
    `/api/subscriptions/status?clubId=${encodeURIComponent(clubId)}`,
  );
}

/**
 * Submit a store purchase receipt to the backend for verification.
 * The backend is the source of truth — only update Pro state after
 * this call succeeds.
 *
 * POST /api/subscriptions/verify
 */
export async function verifyClubPurchase(
  payload: VerifyPurchasePayload,
): Promise<ClubSubscriptionStatus> {
  return apiRequest<ClubSubscriptionStatus>('/api/subscriptions/verify', {
    method: 'POST',
    body: payload,
  });
}
