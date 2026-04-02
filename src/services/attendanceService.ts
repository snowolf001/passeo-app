import {Attendance, MembershipWithUser} from '../types';
import {db} from '../data/mockData';
import {nanoid} from 'nanoid/non-secure';
import {creditService} from './creditService';

// ────────────────────────────────────────────────────────────
// Attendance Service
// Handles: self check-in, manual check-in, attendance queries
// ────────────────────────────────────────────────────────────

export const attendanceService = {
  /**
   * Get all attendance records for a session.
   */
  getAttendancesForSession: async (
    sessionId: string,
  ): Promise<Attendance[]> => {
    return db.getAttendances().filter(a => a.sessionId === sessionId);
  },

  /**
   * Get all sessions a membership has attended.
   */
  getAttendancesForMembership: async (
    membershipId: string,
  ): Promise<Attendance[]> => {
    return db
      .getAttendances()
      .filter(a => a.membershipId === membershipId)
      .sort(
        (a, b) =>
          new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
      );
  },

  /**
   * Check whether a specific membership is already checked in.
   */
  isCheckedIn: (membershipId: string, sessionId: string): boolean => {
    return db
      .getAttendances()
      .some(a => a.membershipId === membershipId && a.sessionId === sessionId);
  },

  /**
   * Self check-in: the current member checks themselves in.
   *
   * Rules:
   * - Must belong to the session's club  (caller ensures via membership lookup)
   * - Must not already be checked in
   * - Must have credits > 0
   */
  selfCheckIn: async (params: {
    membershipId: string;
    sessionId: string;
  }): Promise<{success: boolean; message: string}> => {
    const {membershipId, sessionId} = params;

    const membership = db.getMemberships().find(m => m.id === membershipId);
    if (!membership) return {success: false, message: 'Membership not found.'};

    const session = db.getSessions().find(s => s.id === sessionId);
    if (!session) return {success: false, message: 'Session not found.'};

    if (membership.clubId !== session.clubId) {
      return {success: false, message: 'You are not a member of this club.'};
    }

    if (attendanceService.isCheckedIn(membershipId, sessionId)) {
      return {
        success: false,
        message: 'You are already checked in to this session.',
      };
    }

    if (membership.credits <= 0) {
      return {
        success: false,
        message: 'You do not have enough credits to check in.',
      };
    }

    const attendance: Attendance = {
      id: `a_${nanoid(8)}`,
      sessionId,
      membershipId,
      checkedInAt: new Date().toISOString(),
    };

    db.addAttendance(attendance);
    await creditService.deductCredit(
      membershipId,
      sessionId,
      'Session check-in',
    );

    return {success: true, message: 'You are checked in!'};
  },

  /**
   * Manual check-in: a host/admin/owner checks in another member.
   *
   * Rules:
   * - Acting membership must have role host/admin/owner
   * - Target membership must be in the same club
   * - Target must not already be checked in
   * - Target must have credits > 0
   */
  manualCheckIn: async (params: {
    actingMembershipId: string;
    targetMembershipId: string;
    sessionId: string;
  }): Promise<{success: boolean; message: string}> => {
    const {actingMembershipId, targetMembershipId, sessionId} = params;

    const actor = db.getMemberships().find(m => m.id === actingMembershipId);
    if (!actor)
      return {success: false, message: 'Acting membership not found.'};

    const canAct = ['host', 'admin', 'owner'].includes(actor.role);
    if (!canAct)
      return {
        success: false,
        message: 'You do not have permission to check in members.',
      };

    const target = db.getMemberships().find(m => m.id === targetMembershipId);
    if (!target) return {success: false, message: 'Member not found.'};

    const session = db.getSessions().find(s => s.id === sessionId);
    if (!session) return {success: false, message: 'Session not found.'};

    if (target.clubId !== session.clubId) {
      return {
        success: false,
        message: 'That member does not belong to this club.',
      };
    }

    if (attendanceService.isCheckedIn(targetMembershipId, sessionId)) {
      return {success: false, message: 'This member is already checked in.'};
    }

    if (target.credits <= 0) {
      return {success: false, message: 'This member has no remaining credits.'};
    }

    const attendance: Attendance = {
      id: `a_${nanoid(8)}`,
      sessionId,
      membershipId: targetMembershipId,
      checkedInAt: new Date().toISOString(),
    };

    db.addAttendance(attendance);
    await creditService.deductCredit(
      targetMembershipId,
      sessionId,
      'Manual check-in by host',
    );

    return {success: true, message: 'Member checked in.'};
  },

  /**
   * Get all checked-in memberships for a session, enriched with user info.
   */
  getCheckedInMembers: async (
    sessionId: string,
  ): Promise<MembershipWithUser[]> => {
    const attendances = db
      .getAttendances()
      .filter(a => a.sessionId === sessionId);
    const result: MembershipWithUser[] = [];

    for (const att of attendances) {
      const membership = db
        .getMemberships()
        .find(m => m.id === att.membershipId);
      if (!membership) continue;
      const user = db.getUsers().find(u => u.id === membership.userId);
      if (!user) continue;
      result.push({...membership, user});
    }

    return result.sort((a, b) => {
      const attA = attendances.find(x => x.membershipId === a.id);
      const attB = attendances.find(x => x.membershipId === b.id);
      return (
        new Date(attB?.checkedInAt ?? 0).getTime() -
        new Date(attA?.checkedInAt ?? 0).getTime()
      );
    });
  },
};
