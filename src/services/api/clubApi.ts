// src/services/api/clubApi.ts
import {apiRequest} from './apiClient';

export type ApiClub = {
  clubId: string;
  name: string;
  joinCode: string | null;
};

export type ApiClubSettings = {
  allowMemberBackfill: boolean;
  memberBackfillHours: number;
  hostBackfillHours: number;
  enableSessionIntents?: boolean;
};

export type ApiClubMember = {
  membershipId: string;
  userId: string;
  userName: string;
  role: string;
  credits: number;
  active: boolean;
};

export type ApiClubLocation = {
  id: string;
  clubId: string;
  name: string;
  address: string;
  isHidden?: boolean;
};

/**
 * GET /api/clubs/:clubId
 */
export async function getClub(clubId: string): Promise<ApiClub> {
  return apiRequest<ApiClub>('/api/clubs/' + clubId);
}

/**
 * GET /api/clubs/:clubId/settings
 */
export async function getClubSettings(
  clubId: string,
): Promise<ApiClubSettings> {
  return apiRequest<ApiClubSettings>(`/api/clubs/${clubId}/settings`);
}

/**
 * PATCH /api/clubs/:clubId/settings
 */
export async function updateClubSettings(
  clubId: string,
  settings: Partial<ApiClubSettings>,
): Promise<ApiClubSettings> {
  return apiRequest<ApiClubSettings>(`/api/clubs/${clubId}/settings`, {
    method: 'PATCH',
    body: settings,
  });
}

/**
 * GET /api/clubs/:clubId/members
 */
export async function getClubMembers(clubId: string): Promise<ApiClubMember[]> {
  return apiRequest<ApiClubMember[]>(`/api/clubs/${clubId}/members`);
}

/**
 * GET /api/clubs/:clubId/locations
 */
export async function getClubLocations(
  clubId: string,
): Promise<ApiClubLocation[]> {
  return apiRequest<ApiClubLocation[]>(`/api/clubs/${clubId}/locations`);
}

/**
 * POST /api/clubs/:clubId/locations
 */
export async function addClubLocation(
  clubId: string,
  name: string,
  address: string,
): Promise<ApiClubLocation> {
  return apiRequest<ApiClubLocation>(`/api/clubs/${clubId}/locations`, {
    method: 'POST',
    body: {name, address},
  });
}

/**
 * DELETE /api/clubs/:clubId/locations/:locationId
 */
export async function deleteClubLocation(
  clubId: string,
  locationId: string,
): Promise<{success: boolean; mode: 'deleted' | 'hidden'}> {
  return await apiRequest<{success: boolean; mode: 'deleted' | 'hidden'}>(
    `/api/clubs/${clubId}/locations/${locationId}`,
    {
      method: 'DELETE',
    },
  );
}

/**
 * POST /api/clubs/join
 */
export async function joinClub(
  joinCode: string,
  firstName: string,
  lastName: string,
): Promise<{membershipId: string; clubId: string; userId: string}> {
  return apiRequest<{membershipId: string; clubId: string; userId: string}>(
    '/api/clubs/join',
    {
      method: 'POST',
      body: {joinCode, firstName, lastName},
    },
  );
}

/**
 * POST /api/clubs
 */
export async function createClub(
  name: string,
  firstName: string,
  lastName: string,
): Promise<{membershipId: string; clubId: string; userId: string}> {
  return apiRequest<{membershipId: string; clubId: string; userId: string}>(
    '/api/clubs',
    {
      method: 'POST',
      body: {name, firstName, lastName},
    },
  );
}

/**
 * POST /api/clubs/:clubId/regenerate-join-code
 * Generates a new join code. Owner only.
 */
export async function regenerateJoinCode(
  clubId: string,
): Promise<{joinCode: string}> {
  return apiRequest<{joinCode: string}>(
    `/api/clubs/${clubId}/regenerate-join-code`,
    {method: 'POST'},
  );
}

/**
 * POST /api/clubs/:clubId/transfer-ownership
 * Transfers ownership to an active member or host. Owner only.
 */
export async function transferOwnership(
  clubId: string,
  targetMembershipId: string,
): Promise<void> {
  return apiRequest<void>(`/api/clubs/${clubId}/transfer-ownership`, {
    method: 'POST',
    body: {targetMembershipId},
  });
}

/**
 * DELETE /api/clubs/:clubId/members/:membershipId
 * Removes a member. Owner/host only.
 */
export async function removeMember(
  clubId: string,
  membershipId: string,
): Promise<void> {
  return apiRequest<void>(`/api/clubs/${clubId}/members/${membershipId}`, {
    method: 'DELETE',
  });
}

/**
 * POST /api/clubs/:clubId/leave
 * Current user leaves the club. Blocked if user is owner.
 */
export async function leaveClub(clubId: string): Promise<void> {
  await apiRequest<void>(`/api/clubs/${clubId}/leave`, {method: 'POST'});
}

export type ApiRecoveredMembership = {
  membershipId: string;
  clubId: string;
  userId: string;
  displayName: string;
  role: string;
  credits: number;
};

/**
 * POST /api/clubs/:clubId/recover
 * Recovers a membership by display name + recovery code. No auth required.
 */
export async function recoverClubMembership(
  clubId: string,
  displayName: string,
  recoveryCode: string,
): Promise<ApiRecoveredMembership> {
  return apiRequest<ApiRecoveredMembership>(`/api/clubs/${clubId}/recover`, {
    method: 'POST',
    body: {displayName, recoveryCode},
  });
}
