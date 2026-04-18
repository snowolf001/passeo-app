// src/screens/ClubProScreen.tsx
//
// Dedicated Club Pro subscription management screen.
// Shows a different UI based on billingState:
//   free             → features list + upgrade CTA (opens UpgradeProModal)
//   active_renewing  → active details, manage / cancel button
//   active_cancelled → active details + cancelled warning, manage button
//   expired          → expired banner + re-subscribe CTA

import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useApp} from '../context/AppContext';
import {useClubSubscription} from '../hooks/useClubSubscription';
import {useAppTheme} from '../theme/useAppTheme';
import {openManageSubscriptions} from '../utils/manageSubscription';
import UpgradeProModal from '../components/UpgradeProModal';
import type {ThemeColors} from '../theme/colors';
import type {BillingState} from '../types/subscription';

type Props = {navigation: any};

const PRO_FEATURES = [
  '✓  Unlimited members',
  '✓  Advanced attendance reports',
  '✓  Audit log & export to PDF',
  '✓  Custom check-in policies',
  '✓  Priority support',
] as const;

function fmt(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }

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

function capitalize(s?: string | null): string {
  if (!s) {
    return '';
  }

  return s.charAt(0).toUpperCase() + s.slice(1);
}

function billingStateLabel(state: BillingState): string {
  switch (state) {
    case 'active_renewing':
      return 'Active';
    case 'active_cancelled':
      return 'Cancels at period end';
    case 'expired':
      return 'Expired';
    default:
      return 'Free';
  }
}

function billingStateBadgeColor(
  state: BillingState,
  colors: ThemeColors,
): string {
  switch (state) {
    case 'active_renewing':
      return colors.success;
    case 'active_cancelled':
      return colors.warning;
    case 'expired':
      return colors.danger;
    default:
      return colors.textMuted;
  }
}

export default function ClubProScreen({navigation}: Props) {
  const {currentClub} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const clubId = currentClub?.id ?? null;
  const {status, loading, error, refresh} = useClubSubscription(clubId);

  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const handleManageSubscription = useCallback(async () => {
    try {
      await openManageSubscriptions();
    } catch {
      Alert.alert(
        'Cannot open',
        'Unable to open subscription settings. Please manage your subscription in your device settings.',
      );
    }
  }, []);

  const handleUpgradeClose = useCallback(async () => {
    setUpgradeVisible(false);

    try {
      await refresh();
    } catch {
      // non-critical
    }
  }, [refresh]);

  if (!clubId) {
    return null;
  }

  if (loading && !status) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredFill}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !status) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredFill}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const billingState: BillingState = status?.billingState ?? 'free';
  const active = status?.activeSubscription ?? null;
  const scheduled = status?.scheduledSubscription ?? null;
  const lastExpired = status?.lastExpiredSubscription ?? null;
  const isPro = status?.isPro ?? false;

  const isActiveState =
    billingState === 'active_renewing' || billingState === 'active_cancelled';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        {/* ── Status banner (non-free states) ─────────────────────── */}
        {billingState !== 'free' && (
          <View
            style={[
              styles.statusBanner,
              {
                borderColor:
                  billingStateBadgeColor(billingState, colors) + '44',
                backgroundColor:
                  billingStateBadgeColor(billingState, colors) + '14',
              },
            ]}>
            <View style={styles.statusBannerRow}>
              <View
                style={[
                  styles.proBadge,
                  {
                    backgroundColor: billingStateBadgeColor(
                      billingState,
                      colors,
                    ),
                  },
                ]}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
              <Text style={styles.statusLabel}>
                {billingStateLabel(billingState)}
              </Text>
            </View>

            {/* Active subscription details */}
            {isActiveState && active && (
              <>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Plan</Text>
                  <Text style={styles.detailValue}>
                    {capitalize(active.planCycle) || '—'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    {billingState === 'active_cancelled'
                      ? 'Access until'
                      : 'Renews'}
                  </Text>
                  <Text style={styles.detailValue}>
                    {fmt(active.expiresAt)}
                  </Text>
                </View>

                {active.platform && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Billed via</Text>
                    <Text style={styles.detailValue}>
                      {active.platform === 'ios' ? 'App Store' : 'Google Play'}
                    </Text>
                  </View>
                )}

                {scheduled && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Next plan</Text>
                    <Text style={styles.detailValue}>
                      {capitalize(scheduled.planCycle)} from{' '}
                      {fmt(scheduled.startsAt)}
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* Cancelled warning */}
            {billingState === 'active_cancelled' && (
              <Text style={[styles.warningNote, {color: colors.warning}]}>
                Your Pro access will end when the current period expires.
                Re-subscribe any time to keep it active.
              </Text>
            )}

            {/* Expired details */}
            {billingState === 'expired' && lastExpired && (
              <>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Last plan</Text>
                  <Text style={styles.detailValue}>
                    {capitalize(lastExpired.planCycle) || '—'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Expired</Text>
                  <Text style={styles.detailValue}>
                    {fmt(lastExpired.expiresAt)}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Free state: features list ────────────────────────────── */}
        {billingState === 'free' && (
          <>
            <Text style={styles.headline}>Upgrade to Club Pro</Text>
            <Text style={styles.tagline}>
              Unlock the full potential of your club
            </Text>
          </>
        )}

        {/* ── Features card (always visible) ──────────────────────── */}
        <View style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>Pro Features</Text>
          {PRO_FEATURES.map(f => (
            <Text key={f} style={styles.featureItem}>
              {f}
            </Text>
          ))}
        </View>

        {/* ── Free or Expired: Subscribe CTA ──────────────────────── */}
        {(billingState === 'free' || billingState === 'expired') && (
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.85}
            onPress={() => setUpgradeVisible(true)}>
            <Text style={styles.primaryBtnText}>
              {billingState === 'expired'
                ? 'Re-subscribe to Pro'
                : 'Get Club Pro'}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Active states: Manage subscription ──────────────────── */}
        {isActiveState && (
          <TouchableOpacity
            style={styles.manageBtn}
            activeOpacity={0.8}
            onPress={handleManageSubscription}>
            <Text style={styles.manageBtnText}>Manage subscription</Text>
          </TouchableOpacity>
        )}

        {/* ── Expired state: also offer restore ───────────────────── */}
        {billingState === 'expired' && (
          <TouchableOpacity
            style={styles.secondaryBtn}
            activeOpacity={0.8}
            onPress={() => setUpgradeVisible(true)}>
            <Text style={styles.secondaryBtnText}>
              Restore previous purchase
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Legal note ────────────────────────────────────────────── */}
        <Text style={styles.legalNote}>
          Subscriptions auto-renew unless cancelled at least 24 hours before the
          end of the current period. Manage in your device's account settings.
        </Text>
      </ScrollView>

      <UpgradeProModal
        visible={upgradeVisible}
        clubId={clubId}
        onClose={handleUpgradeClose}
      />
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: c.background},
    scroll: {padding: 20, paddingBottom: 48},

    centeredFill: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
      padding: 32,
    },
    errorText: {
      color: c.danger,
      fontSize: 14,
      textAlign: 'center',
    },
    retryBtn: {
      paddingVertical: 10,
      paddingHorizontal: 24,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    retryBtnText: {
      color: c.text,
      fontSize: 14,
      fontWeight: '600',
    },

    headline: {
      color: c.text,
      fontSize: 26,
      fontWeight: '800',
      textAlign: 'center',
      marginBottom: 6,
    },
    tagline: {
      color: c.textMuted,
      fontSize: 15,
      textAlign: 'center',
      marginBottom: 20,
      lineHeight: 22,
    },

    // ── Status banner ─────────────────────────────────────────────
    statusBanner: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 16,
      marginBottom: 20,
      gap: 10,
    },
    statusBannerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    proBadge: {
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    proBadgeText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 11,
      letterSpacing: 0.5,
    },
    statusLabel: {
      color: c.text,
      fontSize: 16,
      fontWeight: '700',
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    detailLabel: {
      color: c.textMuted,
      fontSize: 13,
    },
    detailValue: {
      color: c.text,
      fontSize: 13,
      fontWeight: '600',
    },
    warningNote: {
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
    },

    // ── Features ──────────────────────────────────────────────────
    featuresCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 20,
      gap: 10,
    },
    featuresTitle: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    featureItem: {
      color: c.text,
      fontSize: 15,
      lineHeight: 22,
    },

    // ── Buttons ───────────────────────────────────────────────────
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
    manageBtn: {
      backgroundColor: c.card,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
    },
    manageBtnText: {
      color: c.text,
      fontSize: 15,
      fontWeight: '600',
    },
    secondaryBtn: {
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 4,
    },
    secondaryBtnText: {
      color: c.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    legalNote: {
      color: c.textMuted,
      fontSize: 11,
      textAlign: 'center',
      lineHeight: 16,
      marginTop: 12,
    },
  });
}
