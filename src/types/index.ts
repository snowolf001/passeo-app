// ============================================================
// Club App – Core Type Definitions
// ============================================================

export type UserRole = 'member' | 'host' | 'admin' | 'owner';

// A person in the system. Minimal – identity only.
export type User = {
  id: string;
  name: string;
};

// A club entity. Not tied permanently to one person.
export type Club = {
  id: string;
  name: string;
  joinCode: string;
  createdBy: string; // userId
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
};

// A flattened view of an attendance record for display in history lists.
export type AttendanceHistoryItem = {
  attendanceId: string;
  sessionId: string;
  sessionTitle: string;
  sessionStartTime: string;
  checkedInAt: string;
  locationName?: string;
  locationAddress?: string;
};

// A credit add / deduct ledger entry.
export type CreditTransaction = {
  id: string;
  membershipId: string;
  amount: number; // negative = deduction
  reason: string;
  sessionId?: string;
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
