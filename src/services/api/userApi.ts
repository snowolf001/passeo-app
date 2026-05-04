// src/services/api/userApi.ts
import {apiRequest} from './apiClient';

/**
 * DELETE /api/users/me
 * Soft-deletes and anonymises the current user's account.
 * Requires x-member-id to be set in the API headers (via setActiveMemberId).
 *
 * Throws ApiError with code OWNER_TRANSFER_REQUIRED (409) if the user still
 * owns an active club.
 */
export async function deleteMyAccount(): Promise<{
  success: boolean;
  message: string;
}> {
  return apiRequest<{success: boolean; message: string}>('/api/users/me', {
    method: 'DELETE',
  });
}
