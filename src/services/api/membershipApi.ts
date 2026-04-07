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

/**
 * POST /api/memberships/:membershipId/credits
 * Adds credits to a member. Host/admin only.
 */
export async function adjustMemberCredits(
  membershipId: string,
  amount: number,
  reason: string,
): Promise<ApiMembership> {
  return apiRequest<ApiMembership>(`/api/memberships/${membershipId}/credits`, {
    method: 'POST',
    body: {amount, reason},
  });
}

/**
 * PATCH /api/memberships/:membershipId/role
 * Changes a member's role to 'member' or 'host'. Host/admin/owner only.
 */
export async function updateMemberRole(
  membershipId: string,
  role: 'member' | 'host',
): Promise<ApiMembership> {
  return apiRequest<ApiMembership>(`/api/memberships/${membershipId}/role`, {
    method: 'PATCH',
    body: {role},
  });
}
