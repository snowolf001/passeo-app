// src/components/ClubProCard.tsx
//
// Displays the club's current Pro subscription status and provides
// an entry point to the upgrade modal.
//
// Requires withIAPContext in the component tree (added in App.tsx).
//
// Usage:
//   <ClubProCard clubId={club.id} />

import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {useClubSubscription} from '../hooks/useClubSubscription';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';
import UpgradeProModal from './UpgradeProModal';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  clubId: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined): string {
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClubProCard({clubId}: Props) {
  const {colors} = useAppTheme();
  const s = makeStyles(colors);

  const {
    status,
    loading: statusLoading,
    error: statusError,
    refresh,
  } = useClubSubscription(clubId);

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);

  const busy = refreshingStatus;

  const handleRefreshStatus = useCallback(async () => {
    if (busy) return;

    try {
      setRefreshingStatus(true);
      await refresh();
    } catch (e: any) {
      Alert.alert('Refresh failed', e?.message ?? 'Please try again.');
    } finally {
      setRefreshingStatus(false);
    }
  }, [busy, refresh]);

  const handleOpenUpgrade = useCallback(() => {
    setShowUpgradeModal(true);
  }, []);

  const handleCloseUpgrade = useCallback(() => {
    setShowUpgradeModal(false);
  }, []);

  // ── Loading state ───────────────────────────────────────────────────────────

  if (statusLoading) {
    return (
      <>
        <View style={s.card}>
          <ActivityIndicator color={colors.primary} />
        </View>

        <UpgradeProModal
          visible={showUpgradeModal}
          clubId={clubId}
          onClose={handleCloseUpgrade}
        />
      </>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────

  if (statusError) {
    return (
      <>
        <View style={s.card}>
          <Text style={s.errorText}>{statusError}</Text>

          <TouchableOpacity
            style={s.retryBtn}
            onPress={handleRefreshStatus}
            disabled={refreshingStatus}>
            {refreshingStatus ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={s.retryBtnText}>Try again</Text>
            )}
          </TouchableOpacity>
        </View>

        <UpgradeProModal
          visible={showUpgradeModal}
          clubId={clubId}
          onClose={handleCloseUpgrade}
        />
      </>
    );
  }

  // ── Pro active ──────────────────────────────────────────────────────────────

  if (status?.isPro && status.activeSubscription) {
    const {planCycle, expiresAt} = status.activeSubscription;

    return (
      <>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.badge}>
              <Text style={s.badgeText}>PRO</Text>
            </View>
            <Text style={s.proTitle}>Club Pro</Text>
          </View>

          <Text style={s.detail}>
            Plan: <Text style={s.detailValue}>{capitalize(planCycle)}</Text>
          </Text>

          <Text style={s.detail}>
            Renews: <Text style={s.detailValue}>{fmt(expiresAt)}</Text>
          </Text>

          {status.scheduledSubscription && (
            <Text style={s.note}>
              Next plan ({capitalize(status.scheduledSubscription.planCycle)}){' '}
              starts {fmt(status.scheduledSubscription.startsAt)}
            </Text>
          )}

          <TouchableOpacity
            style={[s.secondaryBtn, busy && s.secondaryBtnDisabled]}
            disabled={busy}
            onPress={handleRefreshStatus}>
            {refreshingStatus ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={s.secondaryBtnText}>Refresh status</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.linkBtn}
            onPress={handleOpenUpgrade}
            disabled={busy}>
            <Text style={s.linkBtnText}>Manage or view plans</Text>
          </TouchableOpacity>
        </View>

        <UpgradeProModal
          visible={showUpgradeModal}
          clubId={clubId}
          onClose={handleCloseUpgrade}
        />
      </>
    );
  }

  // ── Scheduled only (no active, but upcoming) ───────────────────────────────

  if (status?.scheduledSubscription) {
    const {planCycle, startsAt} = status.scheduledSubscription;

    return (
      <>
        <View style={s.card}>
          <Text style={s.sectionTitle}>Club Pro</Text>

          <Text style={s.detail}>
            {capitalize(planCycle)} plan starts{' '}
            <Text style={s.detailValue}>{fmt(startsAt)}</Text>
          </Text>

          <Text style={s.note}>
            Your club has an upcoming Pro subscription. You can view plans or
            refresh status below.
          </Text>

          <TouchableOpacity
            style={s.upgradeBtn}
            onPress={handleOpenUpgrade}
            disabled={busy}>
            <Text style={s.upgradeBtnText}>View plans</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.secondaryBtn, busy && s.secondaryBtnDisabled]}
            disabled={busy}
            onPress={handleRefreshStatus}>
            {refreshingStatus ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={s.secondaryBtnText}>Refresh status</Text>
            )}
          </TouchableOpacity>
        </View>

        <UpgradeProModal
          visible={showUpgradeModal}
          clubId={clubId}
          onClose={handleCloseUpgrade}
        />
      </>
    );
  }

  // ── Free ────────────────────────────────────────────────────────────────────

  return (
    <>
      <View style={s.card}>
        <Text style={s.sectionTitle}>Upgrade to Pro</Text>

        <Text style={s.detail}>
          Unlock advanced club management features, reporting, and more.
        </Text>

        <TouchableOpacity
          style={s.upgradeBtn}
          onPress={handleOpenUpgrade}
          disabled={busy}>
          <Text style={s.upgradeBtnText}>View plans</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.secondaryBtn, busy && s.secondaryBtnDisabled]}
          disabled={busy}
          onPress={handleRefreshStatus}>
          {refreshingStatus ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={s.secondaryBtnText}>Refresh status</Text>
          )}
        </TouchableOpacity>
      </View>

      <UpgradeProModal
        visible={showUpgradeModal}
        clubId={clubId}
        onClose={handleCloseUpgrade}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      marginHorizontal: 16,
      marginVertical: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      gap: 8,
    },
    badge: {
      backgroundColor: c.primary,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    badgeText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 11,
      letterSpacing: 0.5,
    },
    proTitle: {
      color: c.text,
      fontWeight: '700',
      fontSize: 17,
    },
    sectionTitle: {
      color: c.text,
      fontWeight: '700',
      fontSize: 17,
      marginBottom: 12,
    },
    detail: {
      color: c.textMuted,
      fontSize: 14,
      marginBottom: 4,
    },
    detailValue: {
      color: c.text,
      fontWeight: '500',
    },
    note: {
      color: c.textMuted,
      fontSize: 12,
      marginTop: 8,
      fontStyle: 'italic',
    },
    errorText: {
      color: c.danger,
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 8,
    },
    retryBtn: {
      alignSelf: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      minHeight: 40,
      justifyContent: 'center',
    },
    retryBtnText: {
      color: c.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    upgradeBtn: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      marginTop: 12,
    },
    upgradeBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 15,
    },
    secondaryBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
      paddingVertical: 10,
      marginTop: 8,
    },
    secondaryBtnDisabled: {
      opacity: 0.5,
    },
    secondaryBtnText: {
      color: c.primary,
      fontSize: 14,
      fontWeight: '500',
    },
    linkBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
      paddingVertical: 10,
      marginTop: 2,
    },
    linkBtnText: {
      color: c.primary,
      fontSize: 14,
      fontWeight: '500',
    },
  });
}
