// ────────────────────────────────────────────────────────────
// Navigation type definitions
// ────────────────────────────────────────────────────────────

export type RootStackParamList = {
  // Pre-auth / onboarding
  JoinOrCreateClub: undefined;
  JoinClub: undefined;
  CreateClub: undefined;
  RestoreMembership: undefined;

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

  // Reports & management
  MemberHistory: {membershipId: string; title?: string};
  Reports: undefined;
  AuditLog: undefined;
  MemberCredits: undefined;
  MemberCreditHistory: {membershipId: string; memberName?: string};
  PdfPreview: {url: string; title?: string; filename?: string};

  // Club Pro subscription management screen
  ClubPro: undefined;

  // Account deletion
  DeleteAccount: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Schedule: undefined;
  Profile: undefined;
};
