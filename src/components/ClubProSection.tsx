// src/components/ClubProSection.tsx
//
// Shows the club's subscription status and purchase options.
// Dropped into ProfileScreen — no navigation changes required.
//
// States handled:
//   • loading     — skeleton / spinner
//   • error       — retry button
//   • isPro       — current plan summary + optional scheduled note
//   • free        — plan cards with Buy and Restore buttons

import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import {useApp} from '../context/AppContext';
import {useClubSubscription} from '../hooks/useClubSubscription';
import {useClubProPurchase} from '../hooks/useClubProPurchase';
import {SubscriptionPlanCycle} from '../config/iap';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClubProSection() {
  const {currentClub} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    status,
    loading: statusLoading,
    error: statusError,
    refresh,
  } = useClubSubscription(currentClub?.id);

  const purchaseState = useClubProPurchase();
  const {
    products,
    loadingProducts,
    purchasing,
    restoring,
    error: purchaseError,
    purchase,
    restore,
  } = purchaseState;

  const [purchasingPlan, setPurchasingPlan] =
    useState<SubscriptionPlanCycle | null>(null);

  // ── Purchase handler ────────────────────────────────────────────────────────
  const handlePurchase = useCallback(
    async (plan: SubscriptionPlanCycle) => {
      if (!currentClub?.id) {
        Alert.alert('Error', 'No club loaded. Please try again.');
        return;
      }

      // Guard: never allow a second purchase while club already has active Pro.
      // Check backend status — do not trust local state or Store receipts.
      if (status?.isPro) {
        Alert.alert(
          'Club already has Pro',
          'This club already has an active Pro subscription. No additional purchase is needed.',
        );
        return;
      }

      const product = products.find(p => p.planCycle === plan);
      if (!product) {
        Alert.alert('Unavailable', 'This plan is currently unavailable.');
        return;
      }

      setPurchasingPlan(plan);

      try {
        const result = await purchase(product.productId, currentClub.id);

        await refresh();

        if (result.isPro) {
          Alert.alert('Pro is now active', 'Your club now has Pro access.');
        } else if (result.scheduledSubscription) {
          Alert.alert(
            'Purchase verified',
            `Your next plan is scheduled to start on ${formatDateShort(
              result.scheduledSubscription.startsAt,
            )}.`,
          );
        } else {
          Alert.alert('Purchase verified', 'Subscription status updated.');
        }
      } catch (e: any) {
        if (e?.message === 'USER_CANCELLED') {
          return;
        }

        Alert.alert(
          'Purchase failed',
          e?.message || 'Unable to complete purchase. Please try again.',
        );
      } finally {
        setPurchasingPlan(null);
      }
    },
    [currentClub?.id, products, refresh, purchase, status],
  );

  // ── Restore handler ─────────────────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    if (!currentClub?.id) {
      Alert.alert('Error', 'No club loaded. Please try again.');
      return;
    }

    try {
      const result = await restore(currentClub.id);
      await refresh();

      if (result.verifiedCount > 0 && result.status) {
        if (result.status.isPro) {
          Alert.alert(
            'Purchases restored',
            'Pro access has been restored for your club.',
          );
        } else {
          Alert.alert('Purchase verified', 'Subscription status updated.');
        }
      } else if (result.verifyFailed) {
        Alert.alert(
          'Verification failed',
          'Purchases were found but could not be verified. Please contact support.',
        );
      } else {
        Alert.alert('No purchases found', 'No previous purchases were found.');
      }
    } catch (e: any) {
      Alert.alert(
        'Unable to restore purchases',
        e?.message || 'Please try again.',
      );
    }
  }, [currentClub?.id, refresh, restore]);

  // ── Render: loading ─────────────────────────────────────────────────────────
  if (statusLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // ── Render: error ───────────────────────────────────────────────────────────
  if (statusError) {
    return (
      <View style={styles.card}>
        <Text style={[styles.errorText, {color: colors.danger}]}>
          {statusError}
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
          <Text style={[styles.retryBtnText, {color: colors.primary}]}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render: Pro active ──────────────────────────────────────────────────────
  if (status?.isPro) {
    const active = status.activeSubscription;
    const isCancelled = status.billingState === 'active_cancelled';

    return (
      <View style={styles.card}>
        <View style={styles.proBadgeRow}>
          <View style={[styles.proBadge, {backgroundColor: isCancelled ? colors.warning : colors.success}]}>
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
          <Text style={[styles.proTitle, {color: colors.text}]}>
            {active
              ? active.planCycle === 'monthly'
                ? 'Monthly Plan'
                : 'Yearly Plan'
              : 'Pro'}
          </Text>
        </View>

        {active && (
          <Text style={[styles.proMeta, {color: colors.textMuted}]}>
            {isCancelled ? 'Access until' : 'Active until'}{' '}
            {formatDateShort(active.expiresAt)}
          </Text>
        )}

        {isCancelled && (
          <Text style={[styles.proMeta, {color: colors.warning}]}>
            Cancels at period end. Re-subscribe to keep Pro.
          </Text>
        )}

        {status.scheduledSubscription && (
          <Text style={[styles.scheduledNote, {color: colors.textMuted}]}>
            Another subscription is scheduled to start after the current one
            ends.
          </Text>
        )}

        <TouchableOpacity
          style={styles.restoreLink}
          onPress={handleRestore}
          disabled={restoring}>
          {restoring ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.restoreLinkText, {color: colors.primary}]}>
              Restore Purchases
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render: scheduled only (no active Pro) ─────────────────────────────────
  if (!status?.isPro && status?.scheduledSubscription) {
    const sched = status.scheduledSubscription;

    return (
      <View style={styles.card}>
        <Text style={[styles.sectionLabel, {color: colors.textMuted}]}>
          SUBSCRIPTION
        </Text>

        <Text style={[styles.proTitle, {color: colors.text}]}>
          Next plan scheduled
        </Text>

        <Text style={[styles.proMeta, {color: colors.textMuted}]}>
          Starts on {formatDateShort(sched.startsAt)}
        </Text>

        <Text style={[styles.proMeta, {color: colors.textMuted}]}>
          Ends on {formatDateShort(sched.expiresAt)}
        </Text>

        <TouchableOpacity
          style={styles.restoreLink}
          onPress={handleRestore}
          disabled={restoring}>
          {restoring ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.restoreLinkText, {color: colors.primary}]}>
              Restore Purchases
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render: free — show upgrade options ────────────────────────────────────
  const monthly = products.find(p => p.planCycle === 'monthly');
  const yearly = products.find(p => p.planCycle === 'yearly');

  return (
    <View style={styles.card}>
      <Text style={[styles.sectionLabel, {color: colors.textMuted}]}>
        CLUB PRO
      </Text>

      <Text style={[styles.upgradeTitle, {color: colors.text}]}>
        Upgrade to Pro
      </Text>

      <Text style={[styles.upgradeDesc, {color: colors.textMuted}]}>
        Unlock advanced reports and management tools for your club.
      </Text>

      {loadingProducts ? (
        <ActivityIndicator
          color={colors.primary}
          style={styles.productsLoader}
        />
      ) : purchaseError ? (
        <View style={styles.plansErrorRow}>
          <Text style={[styles.errorText, {color: colors.danger}]}>
            {purchaseError}
          </Text>
          <TouchableOpacity onPress={purchaseState.clearError}>
            <Text style={[styles.retryBtnText, {color: colors.primary}]}>
              {' '}
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {monthly && (
            <View style={[styles.planRow, {borderColor: colors.border}]}>
              <View style={styles.planInfo}>
                <Text style={[styles.planName, {color: colors.text}]}>
                  Monthly
                </Text>
                <Text style={[styles.planSub, {color: colors.textMuted}]}>
                  Billed monthly
                </Text>
              </View>

              <Text style={[styles.planPrice, {color: colors.text}]}>
                {monthly.localizedPrice}
              </Text>

              <TouchableOpacity
                style={[styles.buyBtn, {backgroundColor: colors.primary}]}
                onPress={() => handlePurchase('monthly')}
                disabled={purchasingPlan !== null || restoring}>
                {purchasingPlan === 'monthly' ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.buyBtnText}>Buy</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {yearly && (
            <View style={[styles.planRow, {borderColor: colors.border}]}>
              <View style={styles.planInfo}>
                <Text style={[styles.planName, {color: colors.text}]}>
                  Yearly
                </Text>
                <Text style={[styles.planSub, {color: colors.textMuted}]}>
                  Best value
                </Text>
              </View>

              <Text style={[styles.planPrice, {color: colors.text}]}>
                {yearly.localizedPrice}
              </Text>

              <TouchableOpacity
                style={[styles.buyBtn, {backgroundColor: colors.primary}]}
                onPress={() => handlePurchase('yearly')}
                disabled={purchasingPlan !== null || restoring}>
                {purchasingPlan === 'yearly' ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.buyBtnText}>Buy</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      <TouchableOpacity
        style={styles.restoreLink}
        onPress={handleRestore}
        disabled={restoring || purchasingPlan !== null}>
        {restoring ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={[styles.restoreLinkText, {color: colors.primary}]}>
            Restore Purchases
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 18,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 1,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10,
    },
    // Pro active
    proBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    proBadge: {
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginRight: 10,
    },
    proBadgeText: {
      color: '#FFF',
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    proTitle: {
      fontSize: 17,
      fontWeight: '700',
    },
    proMeta: {
      fontSize: 13,
      marginTop: 2,
    },
    scheduledNote: {
      fontSize: 13,
      marginTop: 8,
      fontStyle: 'italic',
    },
    // Upgrade / free
    upgradeTitle: {
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 4,
    },
    upgradeDesc: {
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 14,
    },
    planRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 10,
    },
    planInfo: {flex: 1},
    planName: {fontSize: 15, fontWeight: '600'},
    planSub: {fontSize: 12, marginTop: 1},
    planPrice: {fontSize: 15, fontWeight: '600', marginRight: 12},
    buyBtn: {
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 18,
      minWidth: 60,
      alignItems: 'center',
    },
    buyBtnText: {color: '#FFF', fontWeight: '700', fontSize: 14},
    productsLoader: {marginVertical: 12},
    plansErrorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    errorText: {fontSize: 13},
    retryBtn: {marginTop: 8},
    retryBtnText: {fontSize: 14, fontWeight: '600'},
    restoreLink: {
      marginTop: 14,
      alignSelf: 'flex-start',
    },
    restoreLinkText: {fontSize: 14, fontWeight: '600'},
  });
}
