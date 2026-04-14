// src/types/subscription.ts
//
// Backend subscription status types for club-level Pro.
// Source of truth is always the backend — never derive Pro from local state.

import {SubscriptionPlanCycle} from '../config/iap';

export type {SubscriptionPlanCycle};

export type ActiveSubscription = {
  planCycle: SubscriptionPlanCycle;
  startsAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  provider: 'app_store' | 'google_play';
};

export type ScheduledSubscription = {
  planCycle: SubscriptionPlanCycle;
  startsAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  provider: 'app_store' | 'google_play';
};

/** Shape returned by GET /api/subscriptions/status and POST /api/subscriptions/verify */
export type ClubSubscriptionStatus = {
  isPro: boolean;
  activeSubscription: ActiveSubscription | null;
  scheduledSubscription: ScheduledSubscription | null;
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
