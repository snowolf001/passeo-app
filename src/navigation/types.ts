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
  AttendanceHistory: {membershipId: string; title?: string};
};

export type MainTabParamList = {
  Home: undefined;
  Schedule: undefined;
  Profile: undefined;
};
