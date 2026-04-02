import {Membership, User, Club} from '../types';
import {db, CURRENT_USER_ID} from '../data/mockData';
import {nanoid} from 'nanoid/non-secure';

// ────────────────────────────────────────────────────────────
// Membership Service
// Handles: current membership, join club, create club, restore
// ────────────────────────────────────────────────────────────

export const membershipService = {
  /**
   * Returns the current user's membership, or null if they haven't joined.
   */
  getCurrentMembership: async (): Promise<Membership | null> => {
    const memberships = db.getMemberships();
    return memberships.find(m => m.userId === CURRENT_USER_ID) ?? null;
  },

  /**
   * Returns the User record for the current user.
   */
  getCurrentUser: async (): Promise<User | null> => {
    const users = db.getUsers();
    return users.find(u => u.id === CURRENT_USER_ID) ?? null;
  },

  /**
   * Join an existing club by its join code.
   */
  joinClub: async (
    joinCode: string,
  ): Promise<{success: boolean; message: string}> => {
    const clubs = db.getClubs();
    const club = clubs.find(
      c => c.joinCode.toUpperCase() === joinCode.toUpperCase().trim(),
    );

    if (!club) {
      return {
        success: false,
        message: 'Invalid join code. Please check and try again.',
      };
    }

    // Already a member?
    const existing = db
      .getMemberships()
      .find(m => m.userId === CURRENT_USER_ID && m.clubId === club.id);
    if (existing) {
      return {
        success: false,
        message: 'You are already a member of this club.',
      };
    }

    const newMembership: Membership = {
      id: `m_${nanoid(8)}`,
      userId: CURRENT_USER_ID,
      clubId: club.id,
      role: 'member',
      credits: 0,
      recoveryCode: `RC-${nanoid(8).toUpperCase()}`,
      memberCode: `MC-${nanoid(6).toUpperCase()}`,
    };

    db.addMembership(newMembership);
    return {success: true, message: 'Welcome to the club!'};
  },

  /**
   * Create a brand new club and make the current user its owner.
   */
  createClub: async (
    clubName: string,
  ): Promise<{success: boolean; message: string}> => {
    const trimmedName = clubName.trim();
    if (!trimmedName) {
      return {success: false, message: 'Club name cannot be empty.'};
    }

    const newClub: Club = {
      id: `c_${nanoid(8)}`,
      name: trimmedName,
      joinCode: nanoid(8).toUpperCase(),
      createdBy: CURRENT_USER_ID,
    };

    const newMembership: Membership = {
      id: `m_${nanoid(8)}`,
      userId: CURRENT_USER_ID,
      clubId: newClub.id,
      role: 'owner',
      credits: 0,
      recoveryCode: `RC-${nanoid(8).toUpperCase()}`,
      memberCode: `MC-${nanoid(6).toUpperCase()}`,
    };

    db.addClub(newClub);
    db.addMembership(newMembership);
    return {success: true, message: `Club "${trimmedName}" created!`};
  },

  /**
   * Restore a membership using a memberCode + recoveryCode pair.
   */
  restoreMembership: async (
    memberCode: string,
    recoveryCode: string,
  ): Promise<{success: boolean; message: string}> => {
    const all = db.getMemberships();
    const found = all.find(
      m =>
        m.memberCode.toUpperCase() === memberCode.toUpperCase().trim() &&
        m.recoveryCode.toUpperCase() === recoveryCode.toUpperCase().trim(),
    );

    if (!found) {
      return {
        success: false,
        message: 'No membership found with those credentials.',
      };
    }

    // Re-assign to current user (mock: just update userId)
    db.updateMembership({...found, userId: CURRENT_USER_ID});
    return {success: true, message: 'Membership restored successfully.'};
  },

  /**
   * Get all memberships for a given club (used by host/admin screens).
   */
  getMembershipsByClub: async (clubId: string): Promise<Membership[]> => {
    return db.getMemberships().filter(m => m.clubId === clubId);
  },

  /**
   * Transfer ownership of a club to another member.
   */
  transferOwnership: async (
    clubId: string,
    toMembershipId: string,
    fromMembershipId: string,
  ): Promise<{success: boolean; message: string}> => {
    const memberships = db.getMemberships();
    const from = memberships.find(m => m.id === fromMembershipId);
    const to = memberships.find(m => m.id === toMembershipId);

    if (!from || !to) return {success: false, message: 'Membership not found.'};
    if (from.role !== 'owner')
      return {
        success: false,
        message: 'Only the owner can transfer ownership.',
      };
    if (to.clubId !== clubId)
      return {success: false, message: 'Target member not in this club.'};

    db.updateMembership({...from, role: 'admin'});
    db.updateMembership({...to, role: 'owner'});
    return {success: true, message: 'Ownership transferred.'};
  },
};
