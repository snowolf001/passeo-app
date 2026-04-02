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
   * Deduct 1 credit from a membership and log the transaction.
   * Returns false if the membership is not found or has insufficient credits.
   */
  deductCredit: async (
    membershipId: string,
    sessionId: string,
    reason: string,
  ): Promise<boolean> => {
    const memberships = db.getMemberships();
    const membership = memberships.find(m => m.id === membershipId);
    if (!membership) return false;
    if (membership.credits <= 0) return false;

    db.updateMembership({...membership, credits: membership.credits - 1});

    const transaction: CreditTransaction = {
      id: `ct_${nanoid(8)}`,
      membershipId,
      amount: -1,
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
