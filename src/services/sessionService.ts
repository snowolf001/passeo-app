import {Session} from '../types';
import {db} from '../data/mockData';
import {nanoid} from 'nanoid/non-secure';
import {
  ApiSession,
  getSessions as apiGetSessions,
  getSessionById as apiGetSessionById,
} from './api/sessionApi';

// ────────────────────────────────────────────────────────────
// Session Service
// Handles: list, detail, create sessions
// ────────────────────────────────────────────────────────────

export const sessionService = {
  /**
   * Get all sessions for a club from the backend, sorted chronologically.
   */
  getSessionsByClub: async (clubId: string): Promise<ApiSession[]> => {
    const data = await apiGetSessions(clubId);
    return data.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
  },

  /**
   * Get a single session from the backend.
   */
  getSessionById: async (sessionId: string): Promise<ApiSession | null> => {
    try {
      return await apiGetSessionById(sessionId);
    } catch {
      return null;
    }
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
