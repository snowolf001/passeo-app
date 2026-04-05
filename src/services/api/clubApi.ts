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
 * POST /api/clubs/join
 */
export async function joinClub(
  joinCode: string,
): Promise<{membershipId: string; clubId: string}> {
  return apiRequest<{membershipId: string; clubId: string}>('/api/clubs/join', {
    method: 'POST',
    body: {joinCode},
  });
}

/**
 * POST /api/clubs
 */
export async function createClub(
  name: string,
): Promise<{membershipId: string; clubId: string}> {
  return apiRequest<{membershipId: string; clubId: string}>('/api/clubs', {
    method: 'POST',
    body: {name},
  });
}
