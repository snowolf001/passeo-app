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
