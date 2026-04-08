// src/services/api/attendanceApi.ts
import {apiRequest} from './apiClient';

export type ApiAttendanceItem = {
  attendanceId: string;
  sessionId: string;
  sessionTitle: string;
  checkedInAt: string;
  creditsUsed: number;
  sessionStartTime: string;
  sessionEndTime: string;
  checkInMethod: string; // 'self' | 'manual'
};

/**
 * GET /api/attendance/me
 * Returns attendance history for the authenticated user.
 */
export async function getMyAttendance(): Promise<ApiAttendanceItem[]> {
  console.log('[attendanceApi] getMyAttendance url:', '/api/attendance/me');
  const data = await apiRequest<ApiAttendanceItem[]>('/api/attendance/me');
  console.log('[attendanceApi] getMyAttendance response:', data);
  return data;
}

export type ApiCreditTransaction = {
  transactionId: string;
  amount: number; // negative = used, positive = added
  transactionType: string; // 'checkin' | 'add'
  note: string | null;
  sessionTitle: string | null;
  actorName: string | null; // who added credits (null for check-in deductions)
  createdAt: string;
};

export async function getMyCreditTransactions(): Promise<
  ApiCreditTransaction[]
> {
  return apiRequest<ApiCreditTransaction[]>('/api/credits/me');
}

export async function getMemberCreditTransactions(
  membershipId: string,
): Promise<ApiCreditTransaction[]> {
  return apiRequest<ApiCreditTransaction[]>(
    `/api/memberships/${membershipId}/credits`,
  );
}
