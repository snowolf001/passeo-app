import {User, Session, Attendance} from '../models/types';
import {mockUsers, mockSessions, mockAttendances} from './mockData';

// In-memory data stores
let users = [...mockUsers];
let sessions = [...mockSessions];
let attendances = [...mockAttendances];

export const AttendanceService = {
  getSessions: (): Session[] => {
    return sessions.sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  },

  getSessionById: (id: string): Session | undefined => {
    return sessions.find(s => s.id === id);
  },

  getUsers: (): User[] => {
    return users;
  },

  getUserById: (id: string): User | undefined => {
    return users.find(u => u.id === id);
  },

  getAttendanceForSession: (sessionId: string): Attendance[] => {
    return attendances.filter(a => a.sessionId === sessionId);
  },

  getAttendanceForUser: (userId: string): Attendance[] => {
    return attendances.filter(a => a.userId === userId);
  },

  checkInMember: (
    userId: string,
    sessionId: string,
    hostId: string,
    method: 'manual' | 'qr' = 'manual',
  ): {success: boolean; message?: string; attendance?: Attendance} => {
    const user = users.find(u => u.id === userId);
    if (!user) return {success: false, message: 'User not found'};

    const session = sessions.find(s => s.id === sessionId);
    if (!session) return {success: false, message: 'Session not found'};

    // Rule: Check-in should fail if remainingCredits is 0
    if (user.remainingCredits <= 0) {
      return {success: false, message: 'Insufficient credits'};
    }

    // Rule: A member can only be checked in once per session
    const alreadyCheckedIn = attendances.some(
      a => a.userId === userId && a.sessionId === sessionId,
    );
    if (alreadyCheckedIn) {
      return {
        success: false,
        message: 'Member is already checked in to this session',
      };
    }

    // Create attendance record
    const newAttendance: Attendance = {
      id: `att_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      userId,
      sessionId,
      checkedInAt: new Date().toISOString(),
      checkedInByUserId: hostId,
      method,
    };

    // Update state
    attendances = [...attendances, newAttendance];
    users = users.map(u =>
      u.id === userId ? {...u, remainingCredits: u.remainingCredits - 1} : u,
    );

    return {success: true, attendance: newAttendance};
  },
};
