# Passeo — Restore Purchase: Full Workflow Design

**Date:** April 18, 2026
**Scope:** Android + iOS · club-level entitlement model · production-safe

---

## 1. Restore Goals and Semantics

### What "Restore Purchase" means in Passeo

Restore allows a member who already paid for Club Pro (in their App Store / Google Play account) to re-attach that entitlement to their club when Passeo has no record of it. Typical triggers: reinstalling the app, logging in on a new device, or contacting support after a failed verification.

### How restore differs from a new purchase

A new purchase is initiated from scratch in the store and immediately fires the purchase completion callback. Restore is a retrospective query: the frontend asks the device's local store client for any purchases it already holds for this app's subscription SKUs, then sends the resulting purchase data to the backend for verification. No money changes hands; the device returns purchase records the user already owns.

### How restore differs from querying our own database

Querying our DB tells us what Passeo already knows. Restore tells us what the **store** knows that we may not have recorded yet — for example, a payment that completed during a network outage, a user who purchased on another device, or an upgrade that arrived via webhook before the client could confirm it. Restore is the authoritative re-sync between the store's payment record and our DB.

### Why restore must be positive-only in a club-level model

In a per-user model, "restore finds nothing" is an accurate statement about that user's entitlement. In Passeo's club model it is not: the club's Pro entitlement may have been purchased by a different member on a different store account. If member A purchased on their iPhone and member B (a co-host) taps Restore on their Android phone, the store returns nothing — but the club is still Pro. A "nothing found" result must never result in the club being set to free.

**The cardinal rule:** restore can only add or confirm entitlement; it can never remove it.

| Result                    | DB write              | Club status change   |
| ------------------------- | --------------------- | -------------------- |
| No purchases found        | None                  | None                 |
| Verify failed             | None                  | None                 |
| Verify succeeded (active) | INSERT row if missing | Confirm or grant Pro |

---

## 2. End-to-End Restore Workflow

```
User taps "Restore purchase"
          │
          ▼
[Frontend] getAvailablePurchases() ──► Store OS
          │ returns all purchases current user holds
          │ for this bundle/package
          ▼
[Frontend] Filter: keep only Passeo subscription productIds
          │ (ALL_SUBSCRIPTION_SKUS)
          │ if 0 purchases → return {verifiedCount:0, verifyFailed:false}
          ▼
[Frontend] Sort descending by transactionDate; try each purchase in order
    ┌─────┴──────────────────────┐
    │  For each purchase:        │
    │  normalizeForVerify(...)   │
    │  + isRestore: true         │
    └─────┬──────────────────────┘
          │ POST /api/subscriptions/verify
          │ { clubId, platform, productId,
          │   purchaseToken | receiptData,
          │   transactionId, orderId, isRestore: true }
          ▼
[Backend] Membership auth: actor belongs to club?
          │
          ▼
[Backend] Fast-path idempotency: purchaseToken / transactionId
          already in club_subscriptions for this club?
          │ YES → return current status immediately (no provider call)
          │ NO  → continue
          ▼
[Backend] Call provider verify API
          Android: subscriptionsv2.get(packageName, purchaseToken)
          iOS:     verifyReceipt / App Store Server API
          │
          ├── ACTIVE purchase → createOrScheduleSubscriptionForClub()
          │   insert row, update clubs cache, return 200 + full DTO
          │
          ├── EXPIRED purchase (isRestore: true) →
          │   do NOT insert row, do NOT throw 402,
          │   return 200 + current club status + signal: no_change_needed
          │
          └── provider call fails → do NOT throw 402,
              return 200 + current club status + signal: verify_failed_no_change
          ▼
[Frontend] Call refresh() → GET /api/subscriptions/status
          │ get definitive club Pro state
          ▼
[Frontend] Show result UI based on verifiedCount, status.isPro, signal
```

---

## 3. Frontend Workflow (React Native)

### Which IAP API to call

| Platform | API call                                          |
| -------- | ------------------------------------------------- |
| Android  | `getAvailablePurchases()` from `react-native-iap` |
| iOS      | `getAvailablePurchases()` from `react-native-iap` |

`getAvailablePurchases()` is the correct cross-platform call for restore. On Android it fetches from `BillingClient.queryPurchasesAsync(SUBS)`. On iOS it re-fetches the App Store receipt. **Do not call `requestSubscription` during restore** — that initiates a new purchase flow.

### Current implementation (`useClubProPurchase.ts`)

The existing `restore()` function already correctly:

- Calls `iapGetAvailablePurchases()`
- Filters by `ALL_SUBSCRIPTION_SKUS`
- Sorts by `transactionDate` descending
- Sends the latest to `verifyClubPurchase`

**Gap:** It only sends the single most-recent purchase. If that purchase is expired, verify will fail and `verifyFailed: true` is returned even though an older active purchase might have succeeded. The fix is to iterate all Passeo purchases most-recent-first, stopping at the first successful verify.

### Filtering rules

```typescript
const subPurchases = allPurchases
  .filter(p => ALL_SUBSCRIPTION_SKUS.includes(p.productId))
  .sort(
    (a, b) => Number(b.transactionDate ?? 0) - Number(a.transactionDate ?? 0),
  );
```

### Improved multi-purchase iteration

```typescript
for (const purchase of subPurchases) {
  const payload = normalizeForVerify(purchase, clubId);
  payload.isRestore = true;
  try {
    const result = await verifyClubPurchase(payload);
    const signal = result.restoreSignal;
    if (signal === 'restore_recovered' || signal === 'already_up_to_date') {
      return {status: result, verifiedCount: 1, verifyFailed: false};
    }
    // 'no_change_needed' — continue to next purchase
  } catch {
    // network/server error — stop and report
  }
}
return {status: null, verifiedCount: 0, verifyFailed: false};
```

### Request payload to `/api/subscriptions/verify`

**Android:**

```json
{
  "clubId": "uuid-of-club",
  "platform": "android",
  "provider": "google_play",
  "productId": "passeo_pro_monthly",
  "purchaseToken": "<full token from store>",
  "orderId": "GPA.3394-...",
  "isRestore": true
}
```

**iOS:**

```json
{
  "clubId": "uuid-of-club",
  "platform": "ios",
  "provider": "app_store",
  "productId": "passeo_pro_monthly",
  "receiptData": "<base64 receipt>",
  "transactionId": "2000000...",
  "originalTransactionId": "2000000...",
  "isRestore": true
}
```

### Frontend decision table

| Condition                                  | Action                                                           |
| ------------------------------------------ | ---------------------------------------------------------------- |
| No Passeo purchases found in store         | Show "Nothing to restore" — do NOT call backend                  |
| `restoreSignal: "already_up_to_date"`      | Show "Already active"                                            |
| `restoreSignal: "restore_recovered"`       | Show "Pro access restored"                                       |
| `restoreSignal: "no_change_needed"`        | Show "No active subscription found on this account"              |
| `restoreSignal: "verify_failed_no_change"` | Show "Could not verify. Your club's Pro status was not changed." |
| Backend throws HTTP 4xx/5xx                | Show "Restore failed. Please try again."                         |
| `result.status.isPro` true after restore   | Show "Pro access confirmed" even if `verifiedCount == 0`         |

> **Key principle:** After any restore attempt, always call `refresh()` to get the definitive club status from the backend. Never make UI entitlement decisions from the raw `result.status` returned in the verify response alone.

---

## 4. Backend Workflow

### Reuse `/api/subscriptions/verify` vs dedicated endpoint

**Recommendation: Reuse `POST /api/subscriptions/verify` with an `isRestore: boolean` flag.**

Rationale:

- All critical infrastructure is already correct: membership auth, idempotency, provider verify, DB transaction, system events
- A separate endpoint would duplicate ~80% of that code
- The only behavioral difference: if `isRestore: true`, an expired or non-active subscription is not a 402 error — it is a no-op 200 with a descriptive signal

Two specific branch points where `isRestore` changes behavior:

1. In `verifyGooglePurchase` (or the caller), if state is not `SUBSCRIPTION_STATE_ACTIVE` and `isRestore: true` → return a new IapVerifyResult subtype indicating `restoreExpired: true` rather than throwing or returning `valid: false`
2. In `createOrScheduleSubscriptionForClub`, if `verifyResult.valid === false && input.isRestore === true` → skip the `throw new AppError(402, ...)`, instead return `{subscription: null, idempotent: false, restoreNoOp: true}` so the controller can respond 200 with current status

### Membership / club authorization

No change needed. The existing `assertUserBelongsToClub(actorMemberId, clubId)` runs before any provider call. Any active member of the club can trigger restore — host or owner role is not required.

### Idempotency

Already handled by `findExistingSubscriptionByVerifiedIds`. For restore:

- If `purchaseToken` (Android) or `transactionId` / `originalTransactionId` (iOS) is already in `club_subscriptions` for the correct `clubId` → return `{subscription: existing, idempotent: true}`. No provider call, no DB write.
- Controller translates `idempotent: true` to signal `already_up_to_date` in the response.

### Decision logic for the 8 cases

| #   | Scenario                                         | Backend action                                                 | Response signal                             |
| --- | ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------- |
| 1   | Club active Pro, restore finds valid purchase    | Idempotency fires → return existing row (or insert if missing) | `already_up_to_date` or `restore_recovered` |
| 2   | Club active Pro, restore finds no valid purchase | No DB write, return current status                             | `no_change_needed`                          |
| 3   | Club free, restore finds valid active purchase   | Full verify → insert row → set `pro_status = pro`              | `restore_recovered`                         |
| 4   | Club free, restore finds no valid purchase       | No DB write, return current status                             | `no_change_needed`                          |
| 5   | Purchase belongs to different store account      | `getAvailablePurchases()` never returns it; treated as case 4  | `no_change_needed`                          |
| 6   | Restore purchase is expired                      | `isRestore: true` → no 402, no DB write                        | `no_change_needed`                          |
| 7   | Purchase active, already in DB                   | `findExistingSubscriptionByVerifiedIds` fast-path              | `already_up_to_date`                        |
| 8   | Purchase active, DB missing the row              | Full verify → insert missing row                               | `restore_recovered`                         |

---

## 5. Google Play API Details

### Endpoint

```
GET https://androidpublisher.googleapis.com/androidpublisher/v3/
    applications/{packageName}/purchases/subscriptionsv2/tokens/{purchaseToken}
```

The codebase already uses the v2 API (`subscriptionsv2`). This is the correct production approach. Do not use the legacy v1 `purchases.subscriptions.get`.

### Required identifiers

| Field           | Source                                         | Required |
| --------------- | ---------------------------------------------- | -------- |
| `packageName`   | `GOOGLE_PLAY_PACKAGE_NAME` env var             | Yes      |
| `purchaseToken` | From `react-native-iap` purchase object        | Yes      |
| Bearer token    | Service account OAuth2, via `getAccessToken()` | Yes      |

`productId` is used only to match `lineItems[].productId` in the response — it is not sent in the API URL. `orderId` is not required by Google but is returned as `latestOrderId`.

### Response fields to read

| Field path                     | How used                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `subscriptionState`            | Gate on active states (see table below)                                        |
| `lineItems[].expiryTime`       | Convert RFC 3339 → `expiresAtMs`                                               |
| `lineItems[].productId`        | Must match sent `productId`                                                    |
| `lineItems[].autoRenewingPlan` | Present → auto-renewing subscription                                           |
| `startTime`                    | Subscription start → `purchaseDateMs`                                          |
| `latestOrderId`                | Stored as `orderId` in DB                                                      |
| `acknowledgementState`         | Must be `ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED`; backend auto-acknowledges if not |
| `canceledStateContext`         | Presence indicates `SUBSCRIPTION_STATE_CANCELED`                               |
| `testPurchase`                 | Presence indicates sandbox/test purchase                                       |

### Subscription state mapping

| `subscriptionState`                  | Restore behavior                                                |
| ------------------------------------ | --------------------------------------------------------------- |
| `SUBSCRIPTION_STATE_ACTIVE`          | Valid — grant Pro                                               |
| `SUBSCRIPTION_STATE_IN_GRACE_PERIOD` | Valid — grant Pro (billing grace period, still entitled)        |
| `SUBSCRIPTION_STATE_CANCELED`        | Valid if `expiryTime` is in the future — grant Pro until expiry |
| `SUBSCRIPTION_STATE_ON_HOLD`         | Treat as expired — no grant                                     |
| `SUBSCRIPTION_STATE_EXPIRED`         | Expired — no grant, no 402, return `no_change_needed`           |
| `SUBSCRIPTION_STATE_PAUSED`          | Treat as expired — no grant                                     |

> **Current gap:** `googleVerify.ts` only accepts `SUBSCRIPTION_STATE_ACTIVE` as `valid: true`. `IN_GRACE_PERIOD` and in-period `CANCELED` should also be handled.

### autoRenews extraction

```typescript
const autoRenews = lineItem.autoRenewingPlan !== undefined;
// autoRenewingPlan present  = auto-renewing subscription
// prepaidPlan present only  = prepaid / no auto-renew
```

This should be added to `IapVerifyResult` and stored in `verification_payload`. The `autoRenews` field in the DTO can then be populated from it.

---

## 6. Database Behavior

### What restore should write

| Scenario                                 | DB write                                               |
| ---------------------------------------- | ------------------------------------------------------ |
| Purchase already in DB (idempotent)      | None — return existing row                             |
| Purchase ACTIVE, not in DB               | INSERT `club_subscriptions`, UPDATE `clubs.pro_status` |
| Purchase EXPIRED / non-active            | None                                                   |
| Restore fails (provider error)           | None                                                   |
| Club already Pro, token already recorded | None                                                   |

**Restore never deletes rows.** Only `refreshClubSubscriptionStatuses` can expire rows (based on `ends_at`), and only RTDN webhooks or `/refresh` trigger that.

### Effect on subscription states

| State                     | Behavior during restore                                                             |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `activeSubscription`      | Created only if store returns ACTIVE and no matching row exists                     |
| `scheduledSubscription`   | Created if club already has active time and restore discovers a concurrent purchase |
| `lastExpiredSubscription` | Never modified by restore directly                                                  |

### Interaction with other tables

| Table                         | Restore interaction                                                        |
| ----------------------------- | -------------------------------------------------------------------------- |
| `subscription_webhook_events` | Not written during restore — restore is a frontend pull, not a server push |
| `system_events`               | Written for all restore outcomes (see Section 7)                           |

### Migrations required

**No schema migration is needed** for the core restore flow. The `club_subscriptions` table already has all required columns.

Optional future improvement: add a computed `auto_renews` boolean column derived from `verification_payload`. Not required for restore correctness; defer to a separate task.

---

## 7. Logging and Observability

### System events plan

| Event type                        | Logger | `system_events` | Key fields                                                                                                    |
| --------------------------------- | ------ | --------------- | ------------------------------------------------------------------------------------------------------------- |
| `restore_started`                 | `info` | Yes             | `clubId`, `membershipId`, `platform`, `productId`, `purchaseTokenSuffix`                                      |
| `restore_no_purchases_found`      | `info` | Yes             | `clubId`, `membershipId`                                                                                      |
| `restore_idempotent`              | `info` | No              | `clubId`, `subscriptionId`                                                                                    |
| `restore_verify_failed_no_change` | `warn` | Yes             | `clubId`, `membershipId`, `platform`, `productId`, `purchaseTokenSuffix`, `errorMessage`, `subscriptionState` |
| `restore_no_change_needed`        | `info` | Yes             | `clubId`, `membershipId`, `platform`, `productId`, `subscriptionState`, `expiresAt`                           |
| `restore_recovered`               | `info` | Yes             | `clubId`, `membershipId`, `platform`, `productId`, `purchaseTokenSuffix`, `subscriptionId`, `expiresAt`       |

### Frontend logs (`__DEV__` only)

```
[IAP restore] start { clubId }
[IAP restore] getAvailablePurchases: allCount, subCount
[IAP restore] no purchases found for Passeo SKUs
[IAP restore] trying purchase { productId, transactionDate, purchaseTokenSuffix }
[IAP restore] verify result { signal, isPro }
[IAP restore] complete { verifiedCount, verifyFailed, isPro }
```

**Never log:** full purchase tokens, receipt data, full order IDs.

### Backend logger lines (production)

```
info  [subscription] restore started { clubId, platform, productId, purchaseTokenSuffix, actorMemberId }
info  [subscription] restore idempotent — purchase already in DB { clubId, subscriptionId }
info  [subscription] restore recovered subscription { clubId, subscriptionId, platform, plan, expiresAt }
info  [subscription] restore no_change_needed — purchase not active { clubId, subscriptionState, expiredAt }
warn  [subscription] restore verify failed — no change made { clubId, errorMessage, purchaseTokenSuffix }
```

Use `maskTokenSuffix()` (already implemented) — never log the full `purchaseToken`.

### `system_events` payload example

```typescript
recordSystemEvent({
  category: 'iap',
  event_type: 'restore_recovered',
  event_status: 'success',
  club_id: clubId,
  membership_id: actorMemberId,
  platform: 'android',
  product_id: productId,
  purchase_token: purchaseToken, // stored full in DB — acceptable
  related_subscription_id: subscription.id,
  message: 'restore recovered missing subscription row',
  details: {
    subscriptionState: purchase.subscriptionState,
    expiresAt: new Date(expiresAtMs).toISOString(),
    wasIdempotent: false,
  },
});
```

### Expected Railway logs during a successful restore

```
info  [subscription] restore started { clubId:"abc", platform:"android", productId:"passeo_pro_monthly", purchaseTokenSuffix:"...abc1234", actorMemberId:"mem-..." }
info  [Google] subscriptionsv2.get succeeded { subscriptionState:"SUBSCRIPTION_STATE_ACTIVE", expiresAt:"2026-05-18T..." }
info  [subscription] restore recovered subscription { clubId:"abc", subscriptionId:"sub-uuid", platform:"android", plan:"monthly", expiresAt:"2026-05-18T..." }
info  GET /api/subscriptions/status 200 12ms
```

A failed restore (expired token):

```
info  [subscription] restore started { clubId:"abc", platform:"android", ... }
info  [Google] subscriptionsv2.get succeeded { subscriptionState:"SUBSCRIPTION_STATE_EXPIRED", expiresAt:"2025-11-01T..." }
info  [subscription] restore no_change_needed — purchase not active { clubId:"abc", subscriptionState:"SUBSCRIPTION_STATE_EXPIRED" }
info  GET /api/subscriptions/status 200 8ms
```

Note: no `warn` or `error` for an expired token — that is an expected, non-exceptional outcome.

---

## 8. API Contract

### Recommendation: Reuse `POST /api/subscriptions/verify`

Add `isRestore: boolean` to the request body. All existing fields remain unchanged. The response adds a `restoreSignal` field.

### Request — Android restore

```json
{
  "clubId": "3f8a1b9d-0000-4000-a000-000000000001",
  "platform": "android",
  "provider": "google_play",
  "productId": "passeo_pro_monthly",
  "purchaseToken": "mhkbfhgkncbfhgbnde...longtoken",
  "orderId": "GPA.3394-2111-4027-44851",
  "isRestore": true
}
```

### Request — iOS restore

```json
{
  "clubId": "3f8a1b9d-0000-4000-a000-000000000001",
  "platform": "ios",
  "provider": "app_store",
  "productId": "passeo_pro_yearly",
  "receiptData": "MIIW...(base64)...",
  "transactionId": "2000000123456789",
  "originalTransactionId": "2000000100000001",
  "isRestore": true
}
```

### Success response — restore recovered

```json
{
  "success": true,
  "data": {
    "isPro": true,
    "billingState": "active_renewing",
    "activeSubscription": {
      "id": "sub-uuid",
      "platform": "android",
      "planCycle": "monthly",
      "startsAt": "2026-04-18T10:00:00.000Z",
      "expiresAt": "2026-05-18T10:00:00.000Z",
      "status": "active",
      "productId": "passeo_pro_monthly",
      "autoRenews": null
    },
    "scheduledSubscription": null,
    "lastExpiredSubscription": null,
    "restoreSignal": "restore_recovered",
    "idempotent": false
  }
}
```

### Success response — already active / idempotent

```json
{
  "success": true,
  "data": {
    "isPro": true,
    "billingState": "active_renewing",
    "activeSubscription": {"...": "..."},
    "scheduledSubscription": null,
    "lastExpiredSubscription": null,
    "restoreSignal": "already_up_to_date",
    "idempotent": true
  }
}
```

### Success response — expired purchase (no change)

```json
{
  "success": true,
  "data": {
    "isPro": false,
    "billingState": "expired",
    "activeSubscription": null,
    "scheduledSubscription": null,
    "lastExpiredSubscription": {
      "id": "sub-old-uuid",
      "platform": "android",
      "planCycle": "monthly",
      "startsAt": "2025-10-01T10:00:00.000Z",
      "expiresAt": "2025-11-01T10:00:00.000Z",
      "status": "expired",
      "productId": "passeo_pro_monthly"
    },
    "restoreSignal": "no_change_needed",
    "idempotent": false
  }
}
```

### Failure response — exceptional backend error

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred. Your club's Pro status was not changed."
  }
}
```

> HTTP 402 `PAYMENT_REQUIRED` is **not** returned for restore requests with expired tokens. It is only returned for non-restore new purchases where the provider says the purchase is invalid.

---

## 9. Edge Cases and Safety Rules

| Edge case                                                         | Correct system behavior                                                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Another member taps Restore on wrong store account                | `getAvailablePurchases()` returns nothing → frontend exits early, no backend call, club status unchanged                                  |
| Currently active Pro club must not be downgraded                  | Backend never removes `pro_status = 'pro'` as a result of a restore. Expired token → 200 + current status                                 |
| Expired purchase is restored                                      | No 402, no DB write, return current status + `no_change_needed`                                                                           |
| Multiple clubs (future-proofing)                                  | `assertExistingSubscriptionBelongsToClub` throws 403 if a token is already linked to a different club                                     |
| Duplicate restore attempts (race condition)                       | `SELECT ... FOR UPDATE` serializes per club; second request hits idempotency check inside transaction                                     |
| Duplicate purchase tokens in store response                       | `findExistingSubscriptionByVerifiedIds` catches second occurrence → `idempotent: true`                                                    |
| DB already has correct active row                                 | Fast-path idempotency fires before any Google API call                                                                                    |
| Store returns multiple Passeo purchases (one expired, one active) | Frontend iterates most-recent-first; stops at first `restore_recovered` or `already_up_to_date`                                           |
| Active purchase, backend has stale/missing row                    | Provider returns ACTIVE, idempotency check returns null → `createOrScheduleSubscriptionForClub` inserts missing row → `restore_recovered` |

---

## 10. Implementation Plan

### What can stay as-is

- `verifyGooglePurchase` — already uses subscriptionsv2, already acknowledges
- `verifyApplePurchase` — receipt re-send is valid for restore
- `createOrScheduleSubscriptionForClub` — idempotency, transaction, entitlement window calculation
- `assertUserBelongsToClub` — correct for restore
- `normalizeForVerify` in `clubSubscriptionService.ts` — correct, just needs `isRestore: true` added

### Frontend files to change

| File                                      | Change                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/useClubProPurchase.ts`         | Update `restore()` to iterate all Passeo purchases most-recent-first; pass `isRestore: true`; interpret `restoreSignal` from response |
| `src/types/subscription.ts`               | Add `restoreSignal?: string` to `ClubSubscriptionStatus`; add `isRestore?: boolean` to `VerifyPurchasePayload`                        |
| `src/services/clubSubscriptionService.ts` | Pass `isRestore: true` in payload from `normalizeForVerify` or as a separate argument                                                 |
| `src/components/UpgradeProModal.tsx`      | Update restore result UI to use `restoreSignal` for correct messaging                                                                 |

### Backend files to change

| File                                        | Change                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/controllers/subscriptionController.ts` | Parse `isRestore` from body; pass to service; add `restoreSignal` to response; emit `restore_*` system events; do NOT emit 402 on expired token when `isRestore: true`                                     |
| `src/services/subscriptionService.ts`       | Add `isRestore?: boolean` to `VerifyPurchaseInput`; return `restoreNoOp?: boolean` from `VerifyPurchaseResult`; skip `throw AppError(402)` when `verifyResult.valid === false && input.isRestore === true` |
| `src/lib/iap/googleVerify.ts`               | Add `SUBSCRIPTION_STATE_IN_GRACE_PERIOD` as valid-for-restore; return `subscriptionState` in result for logging                                                                                            |
| `src/lib/iap/types.ts`                      | Optionally add `subscriptionState?: string` and `autoRenews?: boolean` to `IapVerifyResult`                                                                                                                |

### Implementation order

1. **Backend:** Add `isRestore` flag to controller + service. Test against a real expired token. Confirm 200 returned instead of 402.
2. **Backend:** Add `restoreSignal` to response DTO. Confirm all three signals: `restore_recovered`, `already_up_to_date`, `no_change_needed`.
3. **Frontend:** Add `isRestore: true` to restore payload. Confirm existing single-purchase path works end-to-end.
4. **Frontend:** Switch from "take latest" to "iterate until success" for multi-purchase scenarios.
5. **Frontend:** Improve restore result UI in `UpgradeProModal` and `ClubProScreen` using `restoreSignal`.
6. **Backend:** Add `restore_*` system events.

### Manual testing checklist

- [ ] Tap Restore on a device with no Passeo store purchases → "Nothing to restore"
- [ ] Tap Restore with an active purchase not yet in DB → "Pro restored", club is now Pro
- [ ] Tap Restore with an active purchase already in DB → "Already active", no new DB row created
- [ ] Tap Restore with an expired purchase → "No active subscription found", club state unchanged
- [ ] Tap Restore when club is already Pro (purchase from different device) → "Already active", Pro confirmed
- [ ] Two members tap Restore simultaneously → both succeed idempotently, no duplicate rows
- [ ] Tap Restore with store returning multiple Passeo purchases (one expired, one active) → active one succeeds
