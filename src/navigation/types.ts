// ────────────────────────────────────────────────────────────
// Navigation type definitions
// ────────────────────────────────────────────────────────────

export type RootStackParamList = {
  // Pre-auth / onboarding
  JoinOrCreateClub: undefined;

  // Main tabbed app
  MainTabs: undefined;

  // Stack screens pushed on top of tabs
  SessionDetail: {sessionId: string};
  ManualCheckIn: {sessionId: string};
  CreateSession: undefined;
  ClubSettings: undefined;
  BackfillSessions: undefined;
  AttendanceHistory: {membershipId: string; title?: string};
  CreditHistory: undefined;

  // Reports & admin
  MemberHistory: {membershipId: string; title?: string};
  Reports: undefined;
  AuditLog: undefined;
  MemberCredits: undefined;
  MemberCreditHistory: {membershipId: string; memberName?: string};

  // Club Pro placeholder paywall (closed testing)
  ClubProPreview: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Schedule: undefined;
  Profile: undefined;
};
