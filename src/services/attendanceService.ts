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
// Defensive helpers
// ────────────────────────────────────────────────────────────

// 防止同一个 membership/session 被并发重复 check-in
const inFlightCheckIns = new Set<string>();

function _makeCheckInKey(membershipId: string, sessionId: string): string {
  return `${membershipId}::${sessionId}`;
}

function _releaseCheckInLock(membershipId: string, sessionId: string) {
  inFlightCheckIns.delete(_makeCheckInKey(membershipId, sessionId));
}

// creditsUsed 清洗：
// - undefined/null/non-number => 1
// - 小数 => floor
// - <= 0 保持原值，后面统一拦截
function _normalizeCreditsUsed(rawCredits?: number): number {
  if (typeof rawCredits !== 'number' || !Number.isFinite(rawCredits)) {
    return 1;
  }
  return Math.floor(rawCredits);
}

function _getSafeCredits(membership?: Membership | null): number {
  const credits = membership?.credits;
  if (typeof credits !== 'number' || !Number.isFinite(credits) || credits < 0) {
    return 0;
  }
  return Math.floor(credits);
}

function _hasExistingAttendance(
  membershipId: string,
  sessionId: string,
): boolean {
  return db
    .getAttendances()
    .some(a => a.membershipId === membershipId && a.sessionId === sessionId);
}

function _getSessionEndMs(session: Session): number {
  const field = (session as any).endTime ?? (session as any).endsAt;
  if (!field) return NaN;
  return new Date(field).getTime();
}

function _isSessionEnded(session: Session): boolean {
  const endMs = _getSessionEndMs(session);
  if (Number.isNaN(endMs)) return false;
  return endMs < Date.now();
}

function _getHoursSinceSessionEnd(session: Session): number {
  const endMs = _getSessionEndMs(session);
  if (Number.isNaN(endMs)) return 0;
  return Math.max(0, (Date.now() - endMs) / (1000 * 60 * 60));
}

function _resolveSettings(clubId: string): ClubSettings {
  if (!clubId) return DEFAULT_CLUB_SETTINGS;
  return (
    db.getClubs().find(c => c.id === clubId)?.settings ?? DEFAULT_CLUB_SETTINGS
  );
}

function _getSafeMemberBackfillHours(settings: ClubSettings): number {
  const hours = settings?.memberBackfillHours;
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) {
    return DEFAULT_CLUB_SETTINGS.memberBackfillHours;
  }
  return hours;
}

function _getSafeHostBackfillHours(settings: ClubSettings): number {
  const hours = settings?.hostBackfillHours;
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) {
    return DEFAULT_CLUB_SETTINGS.hostBackfillHours;
  }
  return hours;
}

function _canMemberBackfill(session: Session, settings: ClubSettings): boolean {
  if (!session) return false;
  if (!settings?.allowMemberBackfill) return false;
  if (!_isSessionEnded(session)) return false;
  return (
    _getHoursSinceSessionEnd(session) <= _getSafeMemberBackfillHours(settings)
  );
}

function _canHostBackfill(session: Session, settings: ClubSettings): boolean {
  if (!session) return false;
  if (!_isSessionEnded(session)) return false;
  return (
    _getHoursSinceSessionEnd(session) <= _getSafeHostBackfillHours(settings)
  );
}

export const attendanceService = {
  isSessionEnded: _isSessionEnded,
  getHoursSinceSessionEnd: _getHoursSinceSessionEnd,
  canMemberBackfill: _canMemberBackfill,
  canHostBackfill: _canHostBackfill,

  getCheckInMode: (params: {
    membership: Membership;
    session: Session;
    settings?: ClubSettings;
    isAlreadyCheckedIn?: boolean;
  }): CheckInMode => {
    const {
      membership,
      session,
      settings = DEFAULT_CLUB_SETTINGS,
      isAlreadyCheckedIn = false,
    } = params;

    // 保护：membership/session 缺失
    if (!membership || !session) return 'not_allowed';

    if (isAlreadyCheckedIn) return 'already_checked_in';
    if (_getSafeCredits(membership) <= 0) return 'no_credits';

    const sessionEnded = _isSessionEnded(session);
    if (!sessionEnded) {
      // Only allow live check-in once the session has actually started
      const startField =
        (session as any).startTime ?? (session as any).startsAt;
      const startMs = startField ? new Date(startField).getTime() : NaN;
      if (Number.isNaN(startMs) || startMs > Date.now()) return 'upcoming';
      return 'live';
    }

    if (!settings.allowMemberBackfill) return 'not_allowed';

    return _canMemberBackfill(session, settings) ? 'backfill' : 'expired';
  },

  getAttendancesForSession: async (
    sessionId: string,
  ): Promise<Attendance[]> => {
    if (!sessionId) return [];
    return db.getAttendances().filter(a => a.sessionId === sessionId);
  },

  getAttendancesForMembership: async (
    membershipId: string,
  ): Promise<Attendance[]> => {
    if (!membershipId) return [];

    return db
      .getAttendances()
      .filter(a => a.membershipId === membershipId)
      .sort(
        (a, b) =>
          new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
      );
  },

  isCheckedIn: (membershipId: string, sessionId: string): boolean => {
    if (!membershipId || !sessionId) return false;

    return db
      .getAttendances()
      .some(a => a.membershipId === membershipId && a.sessionId === sessionId);
  },

  selfCheckIn: async (params: {
    membershipId: string;
    sessionId: string;
    creditsUsed?: number;
  }): Promise<{success: boolean; message: string}> => {
    const {membershipId, sessionId, creditsUsed: rawCredits} = params;
    const creditsUsed = _normalizeCreditsUsed(rawCredits);

    if (!membershipId) {
      return {success: false, message: 'Membership not found.'};
    }

    if (!sessionId) {
      return {success: false, message: 'Session not found.'};
    }

    if (creditsUsed < 1) {
      return {success: false, message: 'creditsUsed must be at least 1.'};
    }

    const checkInKey = _makeCheckInKey(membershipId, sessionId);
    if (inFlightCheckIns.has(checkInKey)) {
      return {
        success: false,
        message: 'Check-in already in progress.',
      };
    }

    inFlightCheckIns.add(checkInKey);

    try {
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

      const safeCredits = _getSafeCredits(membership);
      if (safeCredits < creditsUsed) {
        return {
          success: false,
          message: `You only have ${safeCredits} credit(s). Cannot use ${creditsUsed}.`,
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

      // 写入前再查一次，防竞态重复
      if (_hasExistingAttendance(membershipId, sessionId)) {
        return {
          success: false,
          message: 'You are already checked in to this session.',
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

      const deducted = await creditService.deductCredit(
        membershipId,
        sessionId,
        mode === 'backfill' ? 'Self backfill check-in' : 'Session check-in',
        creditsUsed,
      );

      // credit 失败时回滚 attendance，防止数据不一致
      if (!deducted) {
        const attendances = db.getAttendances();
        const index = attendances.findIndex(a => a.id === attendance.id);
        if (index >= 0) {
          attendances.splice(index, 1);
        }

        return {
          success: false,
          message: 'Failed to deduct credits.',
        };
      }

      return {
        success: true,
        message:
          mode === 'backfill'
            ? 'Backfilled successfully.'
            : 'You are checked in!',
      };
    } finally {
      _releaseCheckInLock(membershipId, sessionId);
    }
  },

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
    const creditsUsed = _normalizeCreditsUsed(rawCredits);

    if (!actingMembershipId) {
      return {success: false, message: 'Acting membership not found.'};
    }

    if (!targetMembershipId) {
      return {success: false, message: 'Member not found.'};
    }

    if (!sessionId) {
      return {success: false, message: 'Session not found.'};
    }

    if (creditsUsed < 1) {
      return {success: false, message: 'creditsUsed must be at least 1.'};
    }

    const checkInKey = _makeCheckInKey(targetMembershipId, sessionId);
    if (inFlightCheckIns.has(checkInKey)) {
      return {
        success: false,
        message: 'Check-in already in progress.',
      };
    }

    inFlightCheckIns.add(checkInKey);

    try {
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

      // 防止跨 club 操作
      if (actor.clubId !== session.clubId) {
        return {
          success: false,
          message: 'You do not have permission to manage this club session.',
        };
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

      const targetCredits = _getSafeCredits(target);
      if (targetCredits < creditsUsed) {
        return {
          success: false,
          message: `This member only has ${targetCredits} credit(s). Cannot use ${creditsUsed}.`,
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

      // 写入前二次查重
      if (_hasExistingAttendance(targetMembershipId, sessionId)) {
        return {success: false, message: 'This member is already checked in.'};
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

      const deducted = await creditService.deductCredit(
        targetMembershipId,
        sessionId,
        sessionEnded ? 'Backfill check-in by host' : 'Manual check-in by host',
        creditsUsed,
      );

      if (!deducted) {
        const attendances = db.getAttendances();
        const index = attendances.findIndex(a => a.id === attendance.id);
        if (index >= 0) {
          attendances.splice(index, 1);
        }

        return {
          success: false,
          message: 'Failed to deduct credits.',
        };
      }

      return {success: true, message: 'Member checked in.'};
    } finally {
      _releaseCheckInLock(targetMembershipId, sessionId);
    }
  },

  getCheckedInMembers: async (
    sessionId: string,
  ): Promise<MembershipWithUser[]> => {
    if (!sessionId) return [];

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
    if (!membershipId) return [];

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
