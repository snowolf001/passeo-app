// src/types/subscription.ts
//
// Backend subscription status types for club-level Pro.
// Source of truth is always the backend — never derive Pro from local state.

import {SubscriptionPlanCycle} from '../config/iap';

export type {SubscriptionPlanCycle};

export type ActiveSubscription = {
  id: string;
  platform: 'ios' | 'android';
  planCycle: SubscriptionPlanCycle;
  startsAt: string | null; // ISO 8601
  expiresAt: string | null; // ISO 8601
  status: string;
  productId: string | null;
  autoRenews: boolean | null;
};

export type ScheduledSubscription = ActiveSubscription;

export type LastExpiredSubscription = {
  id: string;
  platform: 'ios' | 'android';
  planCycle: SubscriptionPlanCycle;
  startsAt: string | null;
  expiresAt: string | null;
  status: string;
  productId: string | null;
};

export type BillingState =
  | 'free'
  | 'active_renewing'
  | 'active_cancelled'
  | 'expired';

/** Shape returned by GET /api/subscriptions/status and POST /api/subscriptions/verify */
export type ClubSubscriptionStatus = {
  isPro: boolean;
  billingState: BillingState;
  activeSubscription: ActiveSubscription | null;
  scheduledSubscription: ScheduledSubscription | null;
  lastExpiredSubscription: LastExpiredSubscription | null;
};

/** Payload for POST /api/subscriptions/verify */
export type VerifyPurchasePayload = {
  clubId: string;
  platform: 'ios' | 'android';
  provider: 'app_store' | 'google_play';
  productId: string;
  // iOS
  receiptData?: string | null;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  // Android
  purchaseToken?: string | null;
  orderId?: string | null;
};
