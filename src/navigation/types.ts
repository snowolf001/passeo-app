export type RootStackParamList = {
  Home: undefined;
  Upgrade: undefined;

  // Club App
  Sessions: undefined;
  SessionDetail: {sessionId: string};
  ManualCheckIn: {sessionId: string};
};
