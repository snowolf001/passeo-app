import {CreditTransaction} from '../types';
import {db} from '../data/mockData';
import {nanoid} from 'nanoid/non-secure';

// ────────────────────────────────────────────────────────────
// Credit Service
// Handles: credit balance and transaction logging
// ────────────────────────────────────────────────────────────

export const creditService = {
  /**
   * Get current credit balance for a membership.
   * (Reads live from in-memory data so it reflects any session deductions.)
   */
  getCredits: async (membershipId: string): Promise<number> => {
    const membership = db.getMemberships().find(m => m.id === membershipId);
    return membership?.credits ?? 0;
  },

  /**
   * Deduct credits from a membership and log the transaction.
   * `amount` defaults to 1. Returns false if membership not found or has insufficient credits.
   */
  deductCredit: async (
    membershipId: string,
    sessionId: string,
    reason: string,
    amount: number = 1,
  ): Promise<boolean> => {
    const memberships = db.getMemberships();
    const membership = memberships.find(m => m.id === membershipId);
    if (!membership) return false;
    if (membership.credits < amount) return false;

    db.updateMembership({...membership, credits: membership.credits - amount});

    const transaction: CreditTransaction = {
      id: `ct_${nanoid(8)}`,
      membershipId,
      amount: -amount,
      reason,
      sessionId,
    };
    db.addCreditTransaction(transaction);

    return true;
  },

  /**
   * Get the credit transaction history for a membership.
   */
  getTransactions: async (
    membershipId: string,
  ): Promise<CreditTransaction[]> => {
    return db
      .getCreditTransactions()
      .filter(t => t.membershipId === membershipId)
      .sort((a, b) => (b.id > a.id ? 1 : -1)); // most recent first (id suffix is time-based)
  },
};
