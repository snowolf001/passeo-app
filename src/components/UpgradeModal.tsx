import React, {useMemo} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import {useApp} from '../context/AppContext';
import {useClubSubscription} from '../hooks/useClubSubscription';
import {useAppTheme} from '../theme/useAppTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called when the user taps "Upgrade". Defaults to onClose if not provided. */
  onUpgrade?: () => void;
};

function fmtDate(iso: string | null | undefined): string {
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

export default function UpgradeModal({visible, onClose, onUpgrade}: Props) {
  const {colors} = useAppTheme();
  const {currentClub} = useApp();

  // Always fetch from backend — never trust local cache.
  const {status, loading} = useClubSubscription(currentClub?.id);

  const isPro = status?.isPro ?? false;
  const isCancelled = status?.billingState === 'active_cancelled';
  const active = status?.activeSubscription ?? null;

  const proStatusLine = useMemo(() => {
    if (!isPro || !active) {
      return null;
    }
    const plan = active.planCycle === 'monthly' ? 'Monthly' : 'Yearly';
    const dateLabel = isCancelled ? 'Access until' : 'Renews';
    return `${plan} plan · ${dateLabel} ${fmtDate(active.expiresAt)}`;
  }, [isPro, isCancelled, active]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, {backgroundColor: colors.overlay}]}
        onPress={onClose}>
        <Pressable style={[styles.sheet, {backgroundColor: colors.card}]}>
          {loading ? (
            // ── Fetching status ───────────────────────────────────────────────
            <ActivityIndicator
              color={colors.primary}
              style={styles.loader}
            />
          ) : isPro ? (
            // ── Club already has Pro ──────────────────────────────────────────
            <>
              <Text style={styles.lockIcon}>✅</Text>
              <Text style={[styles.title, {color: colors.text}]}>
                This club already has Pro
              </Text>
              {proStatusLine ? (
                <Text style={[styles.body, {color: colors.textMuted}]}>
                  {proStatusLine}
                </Text>
              ) : null}
              {isCancelled ? (
                <Text style={[styles.body, {color: colors.warning}]}>
                  Pro will not renew. Re-subscribe any time to keep access.
                </Text>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.closeBtn,
                  {backgroundColor: colors.surfaceRaised},
                ]}
                onPress={onClose}>
                <Text style={[styles.closeBtnText, {color: colors.text}]}>
                  Got it
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            // ── Normal upgrade CTA ────────────────────────────────────────────
            <>
              <Text style={styles.lockIcon}>🔒</Text>
              <Text style={[styles.title, {color: colors.text}]}>
                Upgrade to Pro to unlock this feature
              </Text>
              <Text style={[styles.body, {color: colors.textMuted}]}>
                Applies to the entire club. Does not change roles or
                permissions.
              </Text>
              <TouchableOpacity
                style={[styles.upgradeBtn, {backgroundColor: colors.primary}]}
                onPress={onUpgrade ?? onClose}>
                <Text style={styles.upgradeBtnText}>Upgrade</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.closeBtn,
                  {backgroundColor: colors.surfaceRaised},
                ]}
                onPress={onClose}>
                <Text style={[styles.closeBtnText, {color: colors.text}]}>
                  Not now
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  loader: {
    marginVertical: 32,
  },
  lockIcon: {
    fontSize: 44,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  upgradeBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 8,
  },
  upgradeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
