// src/services/api/sessionApi.ts
import {ApiError} from '../../types/api';
import {apiRequest} from './apiClient';

// ─── Backend response shapes ──────────────────────────────────────────────────

export type ApiSession = {
  id: string;
  clubId: string;
  title: string;
  startTime: string;
  endTime: string;
  createdAt: string;
};

export type ApiCheckedInMember = {
  membershipId: string;
  userId: string;
  userName: string;
  role: 'member' | 'host' | 'owner';
  checkedInAt: string;
  creditsUsed: number;
};

export type ApiCheckInResult = {
  attendanceId: string;
  sessionId: string;
  membershipId: string;
  creditsUsed: number;
  creditsRemaining: number;
  checkedInAt: string;
};

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * GET /api/sessions?clubId=<clubId>
 */
export async function getSessions(clubId: string): Promise<ApiSession[]> {
  console.log(
    '[sessionApi] getSessions url:',
    `/api/sessions?clubId=${clubId}`,
  );
  const data = await apiRequest<ApiSession[]>(`/api/sessions?clubId=${clubId}`);
  console.log('[sessionApi] getSessions response:', data);
  return data;
}

/**
 * GET /api/sessions/:sessionId
 */
export async function getSessionById(sessionId: string): Promise<ApiSession> {
  console.log('[sessionApi] getSessionById url:', `/api/sessions/${sessionId}`);
  const data = await apiRequest<ApiSession>(`/api/sessions/${sessionId}`);
  console.log('[sessionApi] getSessionById response:', data);
  return data;
}

/**
 * GET /api/sessions/:sessionId/checked-in
 */
export async function getCheckedInMembers(
  sessionId: string,
): Promise<ApiCheckedInMember[]> {
  console.log(
    '[sessionApi] getCheckedInMembers url:',
    `/api/sessions/${sessionId}/checked-in`,
  );
  const data = await apiRequest<ApiCheckedInMember[]>(
    `/api/sessions/${sessionId}/checked-in`,
  );
  console.log('[sessionApi] getCheckedInMembers response:', data);
  return data;
}

/**
 * POST /api/sessions/:sessionId/checkin
 */
export async function checkInToSession(
  sessionId: string,
  creditsUsed: number,
): Promise<ApiCheckInResult> {
  console.log(
    '[sessionApi] checkInToSession url:',
    `/api/sessions/${sessionId}/checkin`,
  );
  console.log('[sessionApi] checkInToSession body:', {creditsUsed});
  const data = await apiRequest<ApiCheckInResult>(
    `/api/sessions/${sessionId}/checkin`,
    {method: 'POST', body: {creditsUsed}},
  );
  console.log('[sessionApi] checkInToSession response:', data);
  return data;
}

// ─── Error helpers ────────────────────────────────────────────────────────────

export function getCheckInErrorMessage(error: unknown): string {
  const code = (error as Partial<ApiError>)?.code;
  const message = (error as Partial<ApiError>)?.message;

  switch (code) {
    case 'ALREADY_CHECKED_IN':
      return 'You have already checked in to this session.';
    case 'INSUFFICIENT_CREDITS':
      return 'Not enough credits remaining.';
    case 'MEMBERSHIP_NOT_FOUND':
      return 'Membership not found.';
    case 'NETWORK_ERROR':
      return 'Network error. Please check your connection.';
    default:
      return message || 'Check-in failed. Please try again.';
  }
}

/**
 * POST /api/sessions — create a new session
 */
export async function createSession(params: {
  clubId: string;
  title: string;
  startTime: string;
  endTime?: string | null;
}): Promise<ApiSession> {
  return apiRequest<ApiSession>('/api/sessions', {
    method: 'POST',
    body: params,
  });
}

/**
 * POST /api/sessions/:sessionId/checkin-manual — host manually checks in a member
 */
export async function manualCheckIn(
  sessionId: string,
  targetMembershipId: string,
  creditsUsed: number,
): Promise<ApiCheckInResult> {
  return apiRequest<ApiCheckInResult>(
    `/api/sessions/${sessionId}/checkin-manual`,
    {method: 'POST', body: {targetMembershipId, creditsUsed}},
  );
}
