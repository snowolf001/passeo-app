import {CreditTransaction} from '../types';
import {db} from '../data/mockData';
import {nanoid} from 'nanoid/non-secure';

// ────────────────────────────────────────────────────────────
// Credit Service
// Handles: credit balance and transaction logging
// Defensive / production-safe version
// ────────────────────────────────────────────────────────────

const inFlightCreditDeductions = new Set<string>();

function _makeDeductionKey(
  membershipId: string,
  sessionId: string,
  reason: string,
): string {
  return `${membershipId}::${sessionId}::${reason}`;
}

function _releaseDeductionKey(
  membershipId: string,
  sessionId: string,
  reason: string,
) {
  inFlightCreditDeductions.delete(
    _makeDeductionKey(membershipId, sessionId, reason),
  );
}

function _normalizeAmount(rawAmount?: number): number {
  if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount)) {
    return 1;
  }
  return Math.floor(rawAmount);
}

function _getSafeCredits(credits: unknown): number {
  if (typeof credits !== 'number' || !Number.isFinite(credits) || credits < 0) {
    return 0;
  }
  return Math.floor(credits);
}

export const creditService = {
  getCredits: async (membershipId: string): Promise<number> => {
    if (!membershipId) return 0;

    const membership = db.getMemberships().find(m => m.id === membershipId);
    return _getSafeCredits(membership?.credits);
  },

  deductCredit: async (
    membershipId: string,
    sessionId: string,
    reason: string,
    amount: number = 1,
  ): Promise<boolean> => {
    if (!membershipId) return false;
    if (!sessionId) return false;
    if (!reason?.trim()) return false;

    const normalizedAmount = _normalizeAmount(amount);
    if (normalizedAmount < 1) return false;

    const deductionKey = _makeDeductionKey(membershipId, sessionId, reason);
    if (inFlightCreditDeductions.has(deductionKey)) {
      return false;
    }

    inFlightCreditDeductions.add(deductionKey);

    try {
      const memberships = db.getMemberships();
      const membership = memberships.find(m => m.id === membershipId);
      if (!membership) return false;

      const currentCredits = _getSafeCredits(membership.credits);
      if (currentCredits < normalizedAmount) return false;

      const previousMembership = {...membership};
      const updatedMembership = {
        ...membership,
        credits: currentCredits - normalizedAmount,
      };

      db.updateMembership(updatedMembership);

      try {
        const transaction: CreditTransaction = {
          id: `ct_${nanoid(8)}`,
          membershipId,
          amount: -normalizedAmount,
          reason: reason.trim(),
          sessionId,
          createdAt: new Date().toISOString(),
        };

        db.addCreditTransaction(transaction);
      } catch (error) {
        // 回滚 credits
        db.updateMembership(previousMembership);
        return false;
      }

      return true;
    } finally {
      _releaseDeductionKey(membershipId, sessionId, reason);
    }
  },

  getTransactions: async (
    membershipId: string,
  ): Promise<CreditTransaction[]> => {
    if (!membershipId) return [];

    return db
      .getCreditTransactions()
      .filter(t => t.membershipId === membershipId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  },
};
