export type Session = {
  id: string;
  clubId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string | null;
  checkedIn?: boolean;
};

export type CheckInResponseData = {
  attendanceId: string;
  sessionId: string;
  membershipId?: string;
  creditsUsed?: number;
  remainingCredits: number;
  checkedInAt: string;
};

export type SessionDetailRouteParams = {
  session: Session;
  membershipId: string;
  initialCreditsRemaining: number;
};
