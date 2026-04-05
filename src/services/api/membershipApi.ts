// src/services/api/membershipApi.ts
import {apiRequest} from './apiClient';

export type ApiMembership = {
  membershipId: string;
  clubId: string;
  userId: string;
  userName: string;
  recoveryCode: string;
  role: 'member' | 'host' | 'owner';
  credits: number;
  active: boolean;
};

export type ApiMembershipWithClub = {
  membership: ApiMembership;
  club: {
    clubId: string;
    name: string;
    joinCode: string | null;
  };
};

/**
 * GET /api/memberships/me?clubId=<clubId>
 */
export async function getMyMembership(clubId: string): Promise<ApiMembership> {
  return apiRequest<ApiMembership>(`/api/memberships/me?clubId=${clubId}`);
}

/**
 * GET /api/memberships/:membershipId
 */
export async function getMembershipById(
  membershipId: string,
): Promise<ApiMembershipWithClub> {
  return apiRequest<ApiMembershipWithClub>(`/api/memberships/${membershipId}`);
}
