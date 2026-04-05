// src/services/api/membershipApi.ts
import {apiRequest} from './apiClient';

export type ApiMembership = {
  membershipId: string;
  clubId: string;
  userId: string;
  role: 'member' | 'host' | 'owner';
  credits: number;
  active: boolean;
};

/**
 * GET /api/memberships/me?clubId=<clubId>
 */
export async function getMyMembership(clubId: string): Promise<ApiMembership> {
  console.log('[membershipApi] getMyMembership url:', `/api/memberships/me?clubId=${clubId}`);
  const data = await apiRequest<ApiMembership>(`/api/memberships/me?clubId=${clubId}`);
  console.log('[membershipApi] getMyMembership response:', data);
  return data;
}
