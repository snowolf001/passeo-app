export type UserRole = 'member' | 'host' | 'admin';

export type User = {
  id: string;
  name: string;
  role: UserRole;
  remainingCredits: number;
};

export type Session = {
  id: string;
  title: string;
  startsAt: string;
  location?: string;
  capacity?: number;
};

export type Attendance = {
  id: string;
  userId: string;
  sessionId: string;
  checkedInAt: string;
  checkedInByUserId: string;
  method: 'manual' | 'qr';
};
