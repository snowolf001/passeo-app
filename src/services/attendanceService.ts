import {
  Attendance,
  AttendanceHistoryItem,
  CheckInMode,
  ClubSettings,
  DEFAULT_CLUB_SETTINGS,
  Membership,
  MembershipWithUser,
  Session,
} from '../types';
import {db} from '../data/mockData';
import {nanoid} from 'nanoid/non-secure';
import {creditService} from './creditService';

// ────────────────────────────────────────────────────────────
// Backfill helpers (pure functions, exported via service object)
// ────────────────────────────────────────────────────────────

function _isSessionEnded(session: Session): boolean {
  if (!session.endTime) return false;
  return new Date(session.endTime) < new Date();
}

function _getHoursSinceSessionEnd(session: Session): number {
  if (!session.endTime) return 0;
  const endMs = new Date(session.endTime).getTime();
  return Math.max(0, (Date.now() - endMs) / (1000 * 60 * 60));
}

function _resolveSettings(clubId: string): ClubSettings {
  return (
    db.getClubs().find(c => c.id === clubId)?.settings ?? DEFAULT_CLUB_SETTINGS
  );
}

function _canMemberBackfill(session: Session, settings: ClubSettings): boolean {
  if (!settings.allowMemberBackfill) return false;
  if (!_isSessionEnded(session)) return false;
  return _getHoursSinceSessionEnd(session) <= settings.memberBackfillHours;
}

function _canHostBackfill(session: Session, settings: ClubSettings): boolean {
  if (!_isSessionEnded(session)) return false;
  return _getHoursSinceSessionEnd(session) <= settings.hostBackfillHours;
}

// ────────────────────────────────────────────────────────────
// Attendance Service
// Handles: self check-in, manual check-in, attendance queries
// ────────────────────────────────────────────────────────────

export const attendanceService = {
  // ── Backfill helpers (exposed for screens) ──────────────────

  isSessionEnded: _isSessionEnded,
  getHoursSinceSessionEnd: _getHoursSinceSessionEnd,
  canMemberBackfill: _canMemberBackfill,
  canHostBackfill: _canHostBackfill,

  getCheckInMode: (params: {
    membership: Membership;
    session: Session;
    settings: ClubSettings;
    isAlreadyCheckedIn: boolean;
  }): CheckInMode => {
    const {membership, session, settings, isAlreadyCheckedIn} = params;

    if (isAlreadyCheckedIn) return 'already_checked_in';
    if (membership.credits <= 0) return 'no_credits';

    // Self check-in UI should always follow member self-backfill policy.
    // Host/Admin extended windows are for manual check-in of others, not for
    // this self check-in button.
    if (!_isSessionEnded(session)) return 'live';

    if (!settings.allowMemberBackfill) return 'not_allowed';

    return _canMemberBackfill(session, settings) ? 'backfill' : 'expired';
  },

  // ── Queries ──────────────────────────────────────────────────

  getAttendancesForSession: async (
    sessionId: string,
  ): Promise<Attendance[]> => {
    return db.getAttendances().filter(a => a.sessionId === sessionId);
  },

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

  isCheckedIn: (membershipId: string, sessionId: string): boolean => {
    return db
      .getAttendances()
      .some(a => a.membershipId === membershipId && a.sessionId === sessionId);
  },

  /**
   * Self check-in: the current member checks themselves in.
   *
   * Rules:
   * - Must belong to the session's club
   * - Must not already be checked in
   * - Must have enough credits for creditsUsed
   * - If session ended, must still be within member self-backfill policy
   */
  selfCheckIn: async (params: {
    membershipId: string;
    sessionId: string;
    creditsUsed?: number;
  }): Promise<{success: boolean; message: string}> => {
    const {membershipId, sessionId, creditsUsed: rawCredits} = params;
    const creditsUsed = rawCredits ?? 1;

    if (creditsUsed < 1) {
      return {success: false, message: 'creditsUsed must be at least 1.'};
    }

    const membership = db.getMemberships().find(m => m.id === membershipId);
    if (!membership) {
      return {success: false, message: 'Membership not found.'};
    }

    const session = db.getSessions().find(s => s.id === sessionId);
    if (!session) {
      return {success: false, message: 'Session not found.'};
    }

    if (membership.clubId !== session.clubId) {
      return {success: false, message: 'You are not a member of this club.'};
    }

    if (membership.credits < creditsUsed) {
      return {
        success: false,
        message: `You only have ${membership.credits} credit(s). Cannot use ${creditsUsed}.`,
      };
    }

    const settings = _resolveSettings(membership.clubId);

    const mode = attendanceService.getCheckInMode({
      membership,
      session,
      settings,
      isAlreadyCheckedIn: attendanceService.isCheckedIn(
        membershipId,
        sessionId,
      ),
    });

    if (mode === 'already_checked_in') {
      return {
        success: false,
        message: 'You are already checked in to this session.',
      };
    }

    if (mode === 'no_credits') {
      return {
        success: false,
        message: 'You do not have enough credits to check in.',
      };
    }

    if (mode === 'expired') {
      return {
        success: false,
        message: 'The backfill window for this session has expired.',
      };
    }

    if (mode === 'not_allowed') {
      return {
        success: false,
        message: 'Member backfill is not allowed for this club.',
      };
    }

    if (mode !== 'live' && mode !== 'backfill') {
      return {
        success: false,
        message: 'This session is not eligible for check-in.',
      };
    }

    const source: Attendance['source'] =
      mode === 'backfill' ? 'backfill-self' : 'self';

    const attendance: Attendance = {
      id: `a_${nanoid(8)}`,
      sessionId,
      membershipId,
      checkedInAt: new Date().toISOString(),
      creditsUsed,
      source,
    };

    db.addAttendance(attendance);
    await creditService.deductCredit(
      membershipId,
      sessionId,
      mode === 'backfill' ? 'Self backfill check-in' : 'Session check-in',
      creditsUsed,
    );

    return {
      success: true,
      message:
        mode === 'backfill'
          ? 'Backfilled successfully.'
          : 'You are checked in!',
    };
  },

  /**
   * Manual check-in: a host/admin/owner checks in another member.
   *
   * Rules:
   * - Acting membership must have role host/admin/owner
   * - Target membership must be in the same club
   * - Target must not already be checked in
   * - Target must have enough credits
   * - If session ended, host/admin backfill window applies
   */
  manualCheckIn: async (params: {
    actingMembershipId: string;
    targetMembershipId: string;
    sessionId: string;
    creditsUsed?: number;
  }): Promise<{success: boolean; message: string}> => {
    const {
      actingMembershipId,
      targetMembershipId,
      sessionId,
      creditsUsed: rawCredits,
    } = params;
    const creditsUsed = rawCredits ?? 1;

    if (creditsUsed < 1) {
      return {success: false, message: 'creditsUsed must be at least 1.'};
    }

    const actor = db.getMemberships().find(m => m.id === actingMembershipId);
    if (!actor) {
      return {success: false, message: 'Acting membership not found.'};
    }

    const canAct = ['host', 'admin', 'owner'].includes(actor.role);
    if (!canAct) {
      return {
        success: false,
        message: 'You do not have permission to check in members.',
      };
    }

    const target = db.getMemberships().find(m => m.id === targetMembershipId);
    if (!target) {
      return {success: false, message: 'Member not found.'};
    }

    const session = db.getSessions().find(s => s.id === sessionId);
    if (!session) {
      return {success: false, message: 'Session not found.'};
    }

    if (target.clubId !== session.clubId) {
      return {
        success: false,
        message: 'That member does not belong to this club.',
      };
    }

    if (attendanceService.isCheckedIn(targetMembershipId, sessionId)) {
      return {success: false, message: 'This member is already checked in.'};
    }

    if (target.credits < creditsUsed) {
      return {
        success: false,
        message: `This member only has ${target.credits} credit(s). Cannot use ${creditsUsed}.`,
      };
    }

    const sessionEnded = _isSessionEnded(session);
    let source: Attendance['source'];

    if (sessionEnded) {
      const settings = _resolveSettings(actor.clubId);
      if (!_canHostBackfill(session, settings)) {
        return {
          success: false,
          message: 'The backfill window for this session has expired.',
        };
      }
      source = 'backfill-host';
    } else {
      source = 'manual';
    }

    const attendance: Attendance = {
      id: `a_${nanoid(8)}`,
      sessionId,
      membershipId: targetMembershipId,
      checkedInAt: new Date().toISOString(),
      creditsUsed,
      source,
      createdByMembershipId: actingMembershipId,
    };

    db.addAttendance(attendance);
    await creditService.deductCredit(
      targetMembershipId,
      sessionId,
      sessionEnded ? 'Backfill check-in by host' : 'Manual check-in by host',
      creditsUsed,
    );

    return {success: true, message: 'Member checked in.'};
  },

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

  getAttendanceHistoryForMembership: async (
    membershipId: string,
  ): Promise<AttendanceHistoryItem[]> => {
    const records = db
      .getAttendances()
      .filter(a => a.membershipId === membershipId)
      .sort(
        (a, b) =>
          new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
      );

    const result: AttendanceHistoryItem[] = [];

    for (const att of records) {
      const session = db.getSessions().find(s => s.id === att.sessionId);
      if (!session) continue;
      const location = db.getLocations().find(l => l.id === session.locationId);
      result.push({
        attendanceId: att.id,
        sessionId: session.id,
        sessionTitle: session.title,
        sessionStartTime: session.startTime,
        checkedInAt: att.checkedInAt,
        creditsUsed: att.creditsUsed,
        locationName: location?.name,
        locationAddress: location?.address,
      });
    }

    return result;
  },
};
