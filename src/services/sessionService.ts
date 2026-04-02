import {Session, SessionWithLocation} from '../types';
import {db} from '../data/mockData';
import {nanoid} from 'nanoid/non-secure';

// ────────────────────────────────────────────────────────────
// Session Service
// Handles: list, detail, create sessions
// ────────────────────────────────────────────────────────────

export const sessionService = {
  /**
   * Get all upcoming sessions for a club, sorted chronologically.
   */
  getSessionsByClub: async (clubId: string): Promise<SessionWithLocation[]> => {
    const allSessions = db.getSessions().filter(s => s.clubId === clubId);
    const sorted = allSessions.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
    return sorted.map(s => ({
      ...s,
      location: db.getLocations().find(l => l.id === s.locationId) ?? null,
    }));
  },

  /**
   * Get a single session with its location data.
   */
  getSessionById: async (
    sessionId: string,
  ): Promise<SessionWithLocation | null> => {
    const session = db.getSessions().find(s => s.id === sessionId);
    if (!session) return null;
    return {
      ...session,
      location:
        db.getLocations().find(l => l.id === session.locationId) ?? null,
    };
  },

  /**
   * Create a new session for a club.
   * Caller must ensure the acting membership is host/admin/owner.
   */
  createSession: async (params: {
    clubId: string;
    title: string;
    startTime: string;
    endTime?: string;
    locationId: string;
    capacity?: number;
    createdBy: string; // membershipId
  }): Promise<{success: boolean; message: string; session?: Session}> => {
    const {clubId, title, startTime, locationId, createdBy} = params;

    if (!title.trim())
      return {success: false, message: 'Session title is required.'};
    if (!startTime) return {success: false, message: 'Start time is required.'};

    const locationExists = db
      .getLocations()
      .some(l => l.id === locationId && l.clubId === clubId);
    if (!locationExists)
      return {success: false, message: 'Invalid location for this club.'};

    const newSession: Session = {
      id: `s_${nanoid(8)}`,
      clubId,
      title: title.trim(),
      startTime,
      endTime: params.endTime,
      locationId,
      capacity: params.capacity,
      createdBy,
    };

    db.addSession(newSession);
    return {success: true, message: 'Session created.', session: newSession};
  },
};
