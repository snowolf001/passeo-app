// src/components/UpgradeProModal.tsx
//
// Full-screen modal for upgrading a club to Pro.
// Plug in anywhere:
//
//   const [open, setOpen] = useState(false);
//   <UpgradeProModal visible={open} clubId={club.id} onClose={() => setOpen(false)} />

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {useClubProPurchase} from '../hooks/useClubProPurchase';
import {useClubSubscription} from '../hooks/useClubSubscription';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  clubId: string;
  onClose: () => void;
};

// ─── Static content ───────────────────────────────────────────────────────────

const PRO_FEATURES = [
  '✓  Unlimited members',
  '✓  Advanced attendance reports',
  '✓  Audit log & export to PDF',
  '✓  Custom check-in policies',
  '✓  Priority support',
] as const;

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

export default function UpgradeProModal({visible, clubId, onClose}: Props) {
  const {colors} = useAppTheme();
  const s = makeStyles(colors);

  const {status, refresh} = useClubSubscription(clubId);

  const purchaseState = useClubProPurchase({skip: !visible});

  const products = Array.isArray(purchaseState.products)
    ? purchaseState.products
    : [];

  const {
    loadingProducts,
    purchasing,
    restoring,
    error: purchaseError,
    clearError,
    purchase,
    restore,
  } = purchaseState;

  const [pendingProductId, setPendingProductId] = useState<string | null>(null);

  const busy = purchasing || restoring;
  const isAlreadyPro = status?.isPro;

  const hasMonthlyPlan = useMemo(
    () => products.some(product => product.planCycle === 'monthly'),
    [products],
  );

  const hasYearlyPlan = useMemo(
    () => products.some(product => product.planCycle === 'yearly'),
    [products],
  );

  // Reset transient modal state when the modal closes.
  useEffect(() => {
    if (!visible) {
      setPendingProductId(null);
      clearError();
    }
  }, [visible, clearError]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePurchase = useCallback(
    async (productId: string) => {
      if (busy) return;

      try {
        setPendingProductId(productId);

        const result = await purchase(productId, clubId);

        try {
          await refresh();
        } catch (refreshError) {
          if (__DEV__) {
            console.warn(
              '[UpgradeProModal] purchase succeeded but refresh failed:',
              refreshError,
            );
          }
        }

        if (result.isPro) {
          Alert.alert('Pro activated', 'Your club now has Pro access.', [
            {text: 'Done', onPress: onClose},
          ]);
        } else if (result.scheduledSubscription) {
          Alert.alert(
            'Purchase verified',
            `Your Pro plan starts on ${fmt(
              result.scheduledSubscription.startsAt,
            )}.`,
            [{text: 'Done', onPress: onClose}],
          );
        } else {
          Alert.alert('Purchase verified', 'Your subscription was recorded.', [
            {text: 'Done', onPress: onClose},
          ]);
        }
      } catch (e: any) {
        if (e?.message === 'USER_CANCELLED') return;
        Alert.alert('Purchase failed', e?.message ?? 'Please try again.');
      } finally {
        setPendingProductId(null);
      }
    },
    [busy, purchase, clubId, refresh, onClose],
  );

  const handleRestore = useCallback(async () => {
    if (busy) return;

    try {
      const result = await restore(clubId);

      try {
        await refresh();
      } catch (refreshError) {
        if (__DEV__) {
          console.warn(
            '[UpgradeProModal] restore succeeded but refresh failed:',
            refreshError,
          );
        }
      }

      if (result.verifiedCount > 0) {
        Alert.alert(
          'Restore successful',
          result.status?.isPro
            ? 'Pro access has been restored.'
            : `${result.verifiedCount} purchase(s) restored.`,
          [{text: 'Done', onPress: result.status?.isPro ? onClose : undefined}],
        );
      } else if (result.verifyFailed) {
        Alert.alert(
          'Restore failed',
          'Found purchase(s) but could not verify with server. Please try again.',
        );
      } else {
        Alert.alert(
          'Nothing to restore',
          'No previous Pro purchases were found for this account.',
        );
      }
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message ?? 'Please try again.');
    }
  }, [busy, restore, clubId, refresh, onClose]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.safeArea}>
        {/* Header row */}
        <View style={s.header}>
          <Text style={s.headerTitle}>
            {isAlreadyPro ? 'Club Pro' : 'Upgrade to Pro'}
          </Text>

          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({pressed}) => [s.closeBtn, pressed && s.closeBtnPressed]}>
            <Text style={s.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {/* Hero tagline */}
          <Text style={s.tagline}>Unlock the full potential of your club</Text>

          {/* Feature list */}
          <View style={s.featuresCard}>
            {PRO_FEATURES.map(feature => (
              <Text key={feature} style={s.featureItem}>
                {feature}
              </Text>
            ))}
          </View>

          {/* Current subscription status summary */}
          {isAlreadyPro && status?.activeSubscription && (
            <View style={s.statusCard}>
              <View style={s.statusRow}>
                <View style={s.badge}>
                  <Text style={s.badgeText}>PRO</Text>
                </View>
                <Text style={s.statusText}>
                  {capitalize(status.activeSubscription.planCycle)} plan active
                </Text>
              </View>

              <Text style={s.statusSub}>
                Renews {fmt(status.activeSubscription.expiresAt)}
              </Text>

              {status.scheduledSubscription && (
                <Text style={s.statusSub}>
                  Next: {capitalize(status.scheduledSubscription.planCycle)}{' '}
                  starting {fmt(status.scheduledSubscription.startsAt)}
                </Text>
              )}
            </View>
          )}

          {/* Error banner */}
          {purchaseError && (
            <View style={s.errorBanner}>
              <Text style={s.errorBannerText} numberOfLines={2}>
                {purchaseError}
              </Text>
              <Pressable onPress={clearError} hitSlop={8}>
                <Text style={s.errorBannerDismiss}>✕</Text>
              </Pressable>
            </View>
          )}

          {/* Purchase options */}
          {!isAlreadyPro && (
            <View style={s.plansSection}>
              <Text style={s.plansLabel}>Choose a plan</Text>

              {loadingProducts ? (
                <ActivityIndicator
                  style={s.loadingIndicator}
                  color={colors.primary}
                />
              ) : products.length > 0 ? (
                products.map(product => {
                  const isThisPending =
                    purchasing && pendingProductId === product.productId;

                  const isBestValue =
                    product.planCycle === 'yearly' &&
                    hasMonthlyPlan &&
                    hasYearlyPlan;

                  return (
                    <TouchableOpacity
                      key={product.productId}
                      style={[
                        s.planBtn,
                        isBestValue && s.planBtnHighlighted,
                        busy && s.planBtnDisabled,
                      ]}
                      disabled={busy}
                      activeOpacity={0.8}
                      onPress={() => handlePurchase(product.productId)}>
                      {isBestValue && (
                        <View style={s.planBadge}>
                          <Text style={s.planBadgeText}>Best value</Text>
                        </View>
                      )}

                      {isThisPending ? (
                        <ActivityIndicator
                          size="small"
                          color={isBestValue ? '#fff' : colors.primary}
                        />
                      ) : (
                        <View style={s.planBtnInner}>
                          <Text
                            style={[
                              s.planBtnCycle,
                              isBestValue && s.planBtnCycleHighlighted,
                            ]}>
                            {capitalize(product.planCycle)}
                          </Text>
                          <Text
                            style={[
                              s.planBtnPrice,
                              isBestValue && s.planBtnPriceHighlighted,
                            ]}>
                            {product.localizedPrice}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={s.emptyProducts}>
                  <Text style={s.emptyProductsText}>
                    Plans are temporarily unavailable.
                  </Text>
                  <Text style={s.emptyProductsSub}>
                    Please try again later or restore an existing purchase.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Restore */}
          {!isAlreadyPro && (
            <TouchableOpacity
              style={[s.restoreBtn, busy && s.planBtnDisabled]}
              disabled={busy}
              onPress={handleRestore}>
              {restoring ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={s.restoreBtnText}>Restore previous purchase</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Legal note */}
          <Text style={s.legalNote}>
            Subscriptions auto-renew unless cancelled at least 24 hours before
            the end of the current period. Manage in your device&apos;s account
            settings.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.background,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '700',
    },
    closeBtn: {
      padding: 4,
      borderRadius: 20,
    },
    closeBtnPressed: {
      opacity: 0.5,
    },
    closeBtnText: {
      color: c.textMuted,
      fontSize: 17,
      fontWeight: '600',
      lineHeight: 20,
    },

    // Scroll content
    content: {
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 40,
    },

    tagline: {
      color: c.text,
      fontSize: 22,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 20,
      lineHeight: 30,
    },

    // Feature list
    featuresCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 20,
      gap: 10,
    },
    featureItem: {
      color: c.text,
      fontSize: 15,
      lineHeight: 22,
    },

    // Status card (already Pro)
    statusCard: {
      backgroundColor: c.primary + '18',
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: c.primary + '44',
      marginBottom: 20,
      gap: 4,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
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
    statusText: {
      color: c.text,
      fontSize: 15,
      fontWeight: '600',
    },
    statusSub: {
      color: c.textMuted,
      fontSize: 13,
    },

    // Error banner
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.danger + '22',
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 16,
      gap: 10,
    },
    errorBannerText: {
      color: c.danger,
      fontSize: 13,
      flex: 1,
      lineHeight: 19,
    },
    errorBannerDismiss: {
      color: c.danger,
      fontSize: 15,
      fontWeight: '700',
    },

    // Plan buttons
    plansSection: {
      marginBottom: 6,
    },
    plansLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 12,
    },
    planBtn: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.border,
      paddingVertical: 16,
      paddingHorizontal: 18,
      marginBottom: 10,
      alignItems: 'center',
      minHeight: 64,
      justifyContent: 'center',
    },
    planBtnHighlighted: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    planBtnDisabled: {
      opacity: 0.45,
    },
    planBtnInner: {
      alignItems: 'center',
      gap: 2,
    },
    planBtnCycle: {
      color: c.text,
      fontSize: 16,
      fontWeight: '600',
    },
    planBtnCycleHighlighted: {
      color: '#fff',
    },
    planBtnPrice: {
      color: c.textMuted,
      fontSize: 14,
    },
    planBtnPriceHighlighted: {
      color: 'rgba(255,255,255,0.85)',
    },
    planBadge: {
      position: 'absolute',
      top: -10,
      right: 14,
      backgroundColor: c.warning,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    planBadgeText: {
      color: '#000',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    },

    loadingIndicator: {
      marginVertical: 20,
    },

    emptyProducts: {
      alignItems: 'center',
      paddingVertical: 20,
      gap: 6,
    },
    emptyProductsText: {
      color: c.textMuted,
      fontSize: 14,
      textAlign: 'center',
    },
    emptyProductsSub: {
      color: c.textMuted,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 18,
    },

    // Restore
    restoreBtn: {
      alignItems: 'center',
      paddingVertical: 14,
      marginTop: 4,
      minHeight: 48,
      justifyContent: 'center',
    },
    restoreBtnText: {
      color: c.primary,
      fontSize: 14,
      fontWeight: '500',
    },

    // Legal
    legalNote: {
      color: c.textMuted,
      fontSize: 11,
      textAlign: 'center',
      lineHeight: 17,
      marginTop: 24,
      paddingHorizontal: 8,
    },
  });
}
