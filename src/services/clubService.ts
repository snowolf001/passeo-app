import {Club, ClubLocation, ClubSettings, ClubSubscription} from '../types';
import {db} from '../data/mockData';
import {nanoid} from 'nanoid/non-secure';

// ────────────────────────────────────────────────────────────
// Club Service
// Handles: club details, locations, subscription
// ────────────────────────────────────────────────────────────

export const clubService = {
  /**
   * Get a club by its ID.
   */
  getClub: async (clubId: string): Promise<Club | null> => {
    return db.getClubs().find(c => c.id === clubId) ?? null;
  },

  /**
   * Get all saved locations for a club.
   */
  getLocations: async (clubId: string): Promise<ClubLocation[]> => {
    return db.getLocations().filter(l => l.clubId === clubId);
  },

  /**
   * Add a new location to a club.
   */
  addLocation: async (
    clubId: string,
    name: string,
    address: string,
  ): Promise<{success: boolean; message: string; location?: ClubLocation}> => {
    if (!name.trim() || !address.trim()) {
      return {
        success: false,
        message: 'Location name and address are required.',
      };
    }

    const newLocation: ClubLocation = {
      id: `l_${nanoid(8)}`,
      clubId,
      name: name.trim(),
      address: address.trim(),
    };

    db.addLocation(newLocation);
    return {success: true, message: 'Location added.', location: newLocation};
  },

  /**
   * Update a club's name (admin/owner only – caller must verify role).
   */
  updateClubName: async (
    clubId: string,
    newName: string,
  ): Promise<{success: boolean; message: string}> => {
    const trimmed = newName.trim();
    if (!trimmed)
      return {success: false, message: 'Club name cannot be empty.'};

    const club = db.getClubs().find(c => c.id === clubId);
    if (!club) return {success: false, message: 'Club not found.'};

    db.updateClub({...club, name: trimmed});
    return {success: true, message: 'Club name updated.'};
  },

  /**
   * Get club subscription info.
   */
  getSubscription: async (clubId: string): Promise<ClubSubscription | null> => {
    return db.getClubSubscriptions().find(s => s.clubId === clubId) ?? null;
  },

  /**
   * Update check-in / backfill policy settings for a club.
   */
  updateClubSettings: async (
    clubId: string,
    settings: ClubSettings,
  ): Promise<{success: boolean; message: string}> => {
    const club = db.getClubs().find(c => c.id === clubId);
    if (!club) return {success: false, message: 'Club not found.'};
    db.updateClubSettings(clubId, settings);
    return {success: true, message: 'Settings updated.'};
  },
};
