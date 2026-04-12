// ============================================================
// Club App – Core Type Definitions
// ============================================================

export type UserRole = 'member' | 'host' | 'owner';

// A person in the system. Minimal – identity only.
export type User = {
  id: string;
  name: string;
};

// Check-in / backfill policy for a club.
export type ClubSettings = {
  allowMemberBackfill: boolean;
  memberBackfillHours: number;
  hostBackfillHours: number;
};

export const DEFAULT_CLUB_SETTINGS: ClubSettings = {
  allowMemberBackfill: true,
  memberBackfillHours: 24,
  hostBackfillHours: 72,
};

// Check-in mode for a given membership + session combination.
export type CheckInMode =
  | 'live' // session not ended, can check in normally
  | 'upcoming' // session not started yet
  | 'backfill' // session ended, within backfill window
  | 'expired' // session ended, outside backfill window
  | 'already_checked_in'
  | 'no_credits'
  | 'not_allowed'; // member backfill disabled by club policy

// A club entity. Not tied permanently to one person.
export type Club = {
  id: string;
  name: string;
  joinCode: string;
  createdBy: string; // userId
  settings?: ClubSettings;
};

// A physical location belonging to a club.
export type ClubLocation = {
  id: string;
  clubId: string;
  name: string;
  address: string;
};

// Represents a user's membership of a club.
// One user <-> one club at a time in MVP.
export type Membership = {
  id: string;
  userId: string;
  clubId: string;
  userName: string;
  role: UserRole;
  credits: number;
  recoveryCode: string;
  memberCode: string;
};

// A scheduled class / session at the club.
export type Session = {
  id: string;
  clubId: string;
  title: string;
  startTime: string; // ISO string
  endTime?: string; // ISO string, optional
  locationId: string;
  capacity?: number;
  createdBy: string; // membershipId of creator
};

// A record that a member attended a session.
export type Attendance = {
  id: string;
  sessionId: string;
  membershipId: string;
  checkedInAt: string; // ISO string
  creditsUsed: number; // how many credits were consumed for this check-in
  source?: 'self' | 'manual' | 'backfill-self' | 'backfill-host';
  createdByMembershipId?: string; // for manual / backfill-host
};

// A flattened view of an attendance record for display in history lists.
export type AttendanceHistoryItem = {
  attendanceId: string;
  sessionId: string;
  sessionTitle: string;
  sessionStartTime: string;
  checkedInAt: string;
  creditsUsed: number;
  locationName?: string;
  locationAddress?: string;
};

// A credit add / deduct ledger entry.
export type CreditTransaction = {
  id: string;
  membershipId: string;
  amount: number;
  reason: string;
  sessionId: string;
  createdAt: string;
};

// Club-level subscription / billing info.
export type ClubSubscription = {
  clubId: string;
  plan: 'monthly' | 'yearly';
  expiresAt: string; // ISO string
  paidByUserId: string;
};

// ---- Derived / composite types used by screens ----

// Session enriched with its location record (for display).
export type SessionWithLocation = Session & {
  location: ClubLocation | null;
};

// A membership enriched with the user's name (for member lists).
export type MembershipWithUser = Membership & {
  user: User;
};
