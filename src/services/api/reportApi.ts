import {apiRequest} from './apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionAttendeeItem = {
  attendanceId: string;
  memberId: string;
  memberName: string;
  creditsUsed: number;
  checkInType: 'live' | 'backfill' | 'manual';
  checkedInAt: string;
  checkedInByUserId: string | null;
  checkedInByName: string | null;
};

export type SessionAttendeesResponse = {
  session: {
    id: string;
    clubId: string;
    title: string | null;
    locationId: string;
    locationName: string | null;
    startsAt: string;
    endsAt: string | null;
  };
  attendees: SessionAttendeeItem[];
  summary: {
    totalCheckIns: number;
    totalParticipation: number;
    uniqueMembers: number;
  };
};

export type MemberHistoryItem = {
  attendanceId: string;
  sessionId: string;
  sessionTitle: string | null;
  locationName: string | null;
  sessionStartsAt: string;
  sessionEndsAt: string | null;
  creditsUsed: number;
  checkInType: 'live' | 'backfill' | 'manual';
  checkedInAt: string;
  checkedInByName: string | null;
};

export type MemberHistoryResponse = {
  member: {
    membershipId: string;
    userId: string;
    name: string;
  };
  items: MemberHistoryItem[];
  summary: {
    totalAttendances: number;
    totalParticipation: number;
  };
};

export type AttendanceReportItem = {
  attendanceId: string;
  sessionId: string;
  sessionTitle: string | null;
  sessionStartsAt: string;
  locationName: string | null;
  memberId: string;
  memberName: string;
  creditsUsed: number;
  checkInType: string;
  checkedInAt: string;
  checkedInByName: string | null;
};

export type AttendanceReportResponse = {
  items: AttendanceReportItem[];
  summary: {
    totalCheckIns: number;
    totalParticipation: number;
    uniqueMembers: number;
    totalSessions: number;
  };
};

export type AuditLogItem = {
  id: string;
  action: string;
  actorUserId: string;
  actorName: string | null;
  targetUserId: string | null;
  targetUserName: string | null;
  entityType: string | null;
  entityId: string | null;
  sessionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SessionBreakdownItem = {
  sessionId: string;
  title: string | null;
  locationName: string | null;
  startsAt: string;
  endsAt: string | null;
  totalCheckIns: number;
  totalParticipation: number;
  attendees: SessionAttendeeItem[];
};

export type SessionsBreakdownResponse = {
  sessions: SessionBreakdownItem[];
  summary: {
    totalSessions: number;
    totalCheckIns: number;
    uniqueMembers: number;
    totalParticipation: number;
  };
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildQs(pairs: Array<[string, string | undefined | null]>): string {
  const parts = pairs
    .filter((p): p is [string, string] => p[1] != null && p[1] !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function getSessionAttendees(
  sessionId: string,
): Promise<SessionAttendeesResponse> {
  return apiRequest<SessionAttendeesResponse>(
    `/api/reports/sessions/${sessionId}/attendees`,
  );
}

export async function getMemberHistory(
  membershipId: string,
  params?: {startDate?: string; endDate?: string; limit?: number},
): Promise<MemberHistoryResponse> {
  const qs = buildQs([
    ['startDate', params?.startDate],
    ['endDate', params?.endDate],
    ['limit', params?.limit != null ? String(params.limit) : undefined],
  ]);
  return apiRequest<MemberHistoryResponse>(
    `/api/reports/members/${membershipId}/history${qs}`,
  );
}

export async function getAttendanceReport(params: {
  clubId: string;
  startDate?: string;
  endDate?: string;
  sessionIds?: string[];
  memberId?: string;
  locationId?: string;
  limit?: number;
}): Promise<AttendanceReportResponse> {
  const qs = buildQs([
    ['clubId', params.clubId],
    ['startDate', params.startDate],
    ['endDate', params.endDate],
    [
      'sessionIds',
      params.sessionIds?.length ? params.sessionIds.join(',') : undefined,
    ],
    ['memberId', params.memberId],
    ['locationId', params.locationId],
    ['limit', params.limit != null ? String(params.limit) : undefined],
  ]);
  return apiRequest<AttendanceReportResponse>(`/api/reports/attendance${qs}`);
}

export async function getAuditLogs(params: {
  clubId: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogItem[]> {
  const qs = buildQs([
    ['clubId', params.clubId],
    ['limit', params.limit != null ? String(params.limit) : undefined],
    ['offset', params.offset != null ? String(params.offset) : undefined],
  ]);
  return apiRequest<AuditLogItem[]>(`/api/audit-logs${qs}`);
}

export async function getSessionsBreakdown(params: {
  clubId: string;
  startDate?: string;
  endDate?: string;
  lastOnly?: boolean;
}): Promise<SessionsBreakdownResponse> {
  const qs = buildQs([
    ['clubId', params.clubId],
    ['startDate', params.startDate],
    ['endDate', params.endDate],
    ['last', params.lastOnly ? 'true' : undefined],
  ]);
  return apiRequest<SessionsBreakdownResponse>(
    `/api/reports/sessions/breakdown${qs}`,
  );
}
