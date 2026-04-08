import {
  CheckInMode,
  ClubSettings,
  DEFAULT_CLUB_SETTINGS,
  Membership,
} from '../types';

// ─── Session helpers ──────────────────────────────────────────────────────────

function _getSessionEndMs(session: {
  endTime?: string;
  endsAt?: string;
}): number {
  const field = session.endTime ?? session.endsAt;
  if (!field) return NaN;
  return new Date(field).getTime();
}

export function isSessionEnded(session: {
  endTime?: string;
  endsAt?: string;
}): boolean {
  const endMs = _getSessionEndMs(session);
  if (Number.isNaN(endMs)) return false;
  return endMs < Date.now();
}

export function getHoursSinceSessionEnd(session: {
  endTime?: string;
  endsAt?: string;
}): number {
  const endMs = _getSessionEndMs(session);
  if (Number.isNaN(endMs)) return 0;
  return Math.max(0, (Date.now() - endMs) / (1000 * 60 * 60));
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

function _safeMemberBackfillHours(settings: ClubSettings): number {
  const hours = settings?.memberBackfillHours;
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) {
    return DEFAULT_CLUB_SETTINGS.memberBackfillHours;
  }
  return hours;
}

function _safeHostBackfillHours(settings: ClubSettings): number {
  const hours = settings?.hostBackfillHours;
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) {
    return DEFAULT_CLUB_SETTINGS.hostBackfillHours;
  }
  return hours;
}

// ─── Backfill eligibility ─────────────────────────────────────────────────────

export function canMemberBackfill(
  session: {endTime?: string; endsAt?: string},
  settings: ClubSettings,
): boolean {
  if (!session) return false;
  if (!settings?.allowMemberBackfill) return false;
  if (!isSessionEnded(session)) return false;
  return getHoursSinceSessionEnd(session) <= _safeMemberBackfillHours(settings);
}

export function canHostBackfill(
  session: {endTime?: string; endsAt?: string},
  settings: ClubSettings,
): boolean {
  if (!session) return false;
  if (!isSessionEnded(session)) return false;
  return getHoursSinceSessionEnd(session) <= _safeHostBackfillHours(settings);
}

// ─── Check-in mode ────────────────────────────────────────────────────────────

function _safeCredits(membership?: Membership | null): number {
  const credits = membership?.credits;
  if (typeof credits !== 'number' || !Number.isFinite(credits) || credits < 0) {
    return 0;
  }
  return Math.floor(credits);
}

export function getCheckInMode(params: {
  membership: Membership;
  session: {
    startTime?: string;
    startsAt?: string;
    endTime?: string;
    endsAt?: string;
  };
  settings?: ClubSettings;
  isAlreadyCheckedIn?: boolean;
}): CheckInMode {
  const {
    membership,
    session,
    settings = DEFAULT_CLUB_SETTINGS,
    isAlreadyCheckedIn = false,
  } = params;

  if (!membership || !session) return 'not_allowed';

  if (isAlreadyCheckedIn) return 'already_checked_in';
  if (_safeCredits(membership) <= 0) return 'no_credits';

  const sessionEnded = isSessionEnded(session);
  if (!sessionEnded) {
    const startField = session.startTime ?? session.startsAt;
    const startMs = startField ? new Date(startField).getTime() : NaN;
    if (Number.isNaN(startMs) || startMs > Date.now()) return 'upcoming';
    return 'live';
  }

  if (!settings.allowMemberBackfill) return 'not_allowed';

  return canMemberBackfill(session, settings) ? 'backfill' : 'expired';
}
