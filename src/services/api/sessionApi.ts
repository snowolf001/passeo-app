// src/services/api/sessionApi.ts
import {ApiError} from '../../types/api';
import {apiRequest} from './apiClient';

// ─── Backend response shapes ──────────────────────────────────────────────────

export type ApiSessionHost = {
  membershipId: string;
  displayName: string;
};

export type ApiSession = {
  id: string;
  clubId: string;
  title: string | null;
  startTime: string;
  endTime: string;
  createdAt: string;
  locationId: string | null;
  locationName: string | null;
  capacity: number | null;
  status: 'active' | 'closed';
  checkedInCount: number;
  goingCount: number;
  host?: ApiSessionHost | null;
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
    case 'SESSION_FULL':
      return 'This session is full.';
    case 'SESSION_CLOSED':
      return 'This session is no longer accepting check-ins.';
    case 'SESSION_NOT_STARTED':
      return 'This session has not started yet.';
    case 'INSUFFICIENT_CREDITS':
      return 'Not enough credits remaining.';
    case 'MEMBERSHIP_NOT_FOUND':
      return 'Membership not found.';
    case 'UNAUTHORIZED':
    case 'FORBIDDEN':
      return "You don't have permission to perform this action.";
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
  title?: string | null;
  locationId: string;
  startTime: string;
  endTime: string;
  capacity?: number | null;
  hostMembershipId?: string | null;
}): Promise<ApiSession> {
  return apiRequest<ApiSession>('/api/sessions', {
    method: 'POST',
    body: params,
  });
}

/**
 * PATCH /api/sessions/:sessionId — update session fields (e.g. assigned host)
 * Owner/host only.
 */
export async function updateSession(
  sessionId: string,
  params: {hostMembershipId?: string | null},
): Promise<ApiSession> {
  return apiRequest<ApiSession>(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
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

/**
 * DELETE /api/sessions/:sessionId — delete an empty session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await apiRequest<void>(`/api/sessions/${sessionId}`, {method: 'DELETE'});
}

// ─── Session Intents ──────────────────────────────────────────────────────────

export type ApiIntentMember = {
  membershipId: string;
  displayName: string;
  createdAt: string;
};

export type ApiSessionIntentSummary = {
  enabled: boolean;
  count: number;
  currentMemberGoing: boolean;
  members: ApiIntentMember[];
};

/**
 * GET /api/sessions/:sessionId/intents
 * Returns the planned-attendance summary for the session.
 */
export async function getSessionIntentSummary(
  sessionId: string,
): Promise<ApiSessionIntentSummary> {
  return apiRequest<ApiSessionIntentSummary>(
    `/api/sessions/${sessionId}/intents`,
  );
}

/**
 * PUT /api/sessions/:sessionId/intent
 * Marks or unmarks the current member as going to the session.
 */
export async function setSessionIntent(
  sessionId: string,
  going: boolean,
): Promise<{going: boolean}> {
  return apiRequest<{going: boolean}>(`/api/sessions/${sessionId}/intent`, {
    method: 'PUT',
    body: {going},
  });
}
