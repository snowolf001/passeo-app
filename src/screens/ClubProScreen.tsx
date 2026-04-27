// src/screens/ClubProScreen.tsx

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useApp} from '../context/AppContext';
import {
  useClubProPurchase,
  type StoreProduct,
} from '../hooks/useClubProPurchase';
import {useClubSubscription} from '../hooks/useClubSubscription';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';
import {openManageSubscriptions} from '../utils/manageSubscription';
import type {BillingState} from '../types/subscription';

type Props = {navigation: any};

const PRO_FEATURES = [
  '✓  Gain insights with advanced attendance reports',
  '✓  Track every change with a complete audit log',
  '✓  Export professional PDF reports in seconds',
  '✓  Customize check-in rules for your club',
  '✓  Get faster help with priority support',
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

  const {
    status,
    loading: statusLoading,
    error: statusError,
    refresh,
  } = useClubSubscription(clubId ?? undefined);

  const {
    products,
    loadingProducts,
    purchasing,
    restoring,
    error: purchaseError,
    clearError,
    purchase,
    restore,
  } = useClubProPurchase();

  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );

  const billingState: BillingState = status?.billingState ?? 'free';
  const active = status?.activeSubscription ?? null;
  const scheduled = status?.scheduledSubscription ?? null;
  const lastExpired = status?.lastExpiredSubscription ?? null;

  const isActiveState =
    billingState === 'active_renewing' || billingState === 'active_cancelled';

  const monthlyProduct = useMemo(
    () => products.find(p => p.planCycle === 'monthly') ?? null,
    [products],
  );

  const yearlyProduct = useMemo(
    () => products.find(p => p.planCycle === 'yearly') ?? null,
    [products],
  );

  const busy = purchasing || restoring;

  useEffect(() => {
    const currentStillExists = !!products.find(
      p => p.productId === selectedProductId,
    );

    if (currentStillExists) {
      return;
    }

    if (yearlyProduct) {
      setSelectedProductId(yearlyProduct.productId);
      return;
    }

    if (monthlyProduct) {
      setSelectedProductId(monthlyProduct.productId);
      return;
    }

    setSelectedProductId(null);
  }, [products, selectedProductId, yearlyProduct, monthlyProduct]);

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

  const handlePurchase = useCallback(async () => {
    if (busy) {
      return;
    }

    if (!clubId) {
      Alert.alert('Error', 'Club not ready. Please try again.');
      return;
    }

    if (!selectedProductId) {
      Alert.alert('Choose a plan', 'Please select a subscription plan.');
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

    try {
      clearError();
      await purchase(selectedProductId, clubId);

      try {
        await refresh();
      } catch (refreshError) {
        if (__DEV__) {
          console.warn(
            '[ClubProScreen] purchase succeeded but refresh failed:',
            refreshError,
          );
        }
      }

      Alert.alert('Success', 'Club Pro has been activated for your club.');
    } catch (e: any) {
      if (e?.message === 'USER_CANCELLED') {
        return;
      }

      Alert.alert('Purchase failed', e?.message ?? 'Please try again.');
    }
  }, [busy, clearError, clubId, purchase, refresh, selectedProductId, status]);

  const handleRestore = useCallback(async () => {
    if (busy) {
      return;
    }

    if (!clubId) {
      Alert.alert('Error', 'Club not ready. Please try again.');
      return;
    }

    try {
      clearError();
      const result = await restore(clubId);

      try {
        await refresh();
      } catch (refreshError) {
        if (__DEV__) {
          console.warn(
            '[ClubProScreen] restore succeeded but refresh failed:',
            refreshError,
          );
        }
      }

      if (result.status?.isPro) {
        Alert.alert('Restore successful', 'Club Pro has been restored.');
        return;
      }

      if (result.verifyFailed) {
        Alert.alert(
          'Restore failed',
          'Found a previous purchase, but verification with the server failed.',
        );
        return;
      }

      if (result.verifiedCount === 0) {
        Alert.alert(
          'Nothing to restore',
          'No previous Club Pro purchase was found for this account.',
        );
        return;
      }

      Alert.alert('Restore complete', 'Restore finished.');
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message ?? 'Please try again.');
    }
  }, [busy, clearError, clubId, refresh, restore]);

  const renderPlanCard = useCallback(
    (product: StoreProduct, subtitle: string, bestValue?: boolean) => {
      const selected = selectedProductId === product.productId;
      const pendingThisProduct =
        purchasing && selectedProductId === product.productId;

      return (
        <TouchableOpacity
          key={product.productId}
          style={[
            styles.planCard,
            selected && styles.planCardSelected,
            busy && styles.planCardDisabled,
          ]}
          activeOpacity={0.85}
          disabled={busy}
          onPress={() => {
            clearError();
            setSelectedProductId(product.productId);
          }}>
          {bestValue ? (
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>Best value</Text>
            </View>
          ) : null}

          <View style={styles.planHeaderRow}>
            <Text style={styles.planTitle}>
              {product.planCycle === 'yearly' ? 'Yearly' : 'Monthly'}
            </Text>

            <View
              style={[
                styles.radioOuter,
                selected && styles.radioOuterSelected,
              ]}>
              {selected ? <View style={styles.radioInner} /> : null}
            </View>
          </View>

          {pendingThisProduct ? (
            <ActivityIndicator
              style={styles.planSpinner}
              size="small"
              color={colors.primary}
            />
          ) : (
            <>
              <Text style={styles.planPrice}>
                {product.localizedPrice || '—'}
              </Text>
              <Text style={styles.planSubtitle}>{subtitle}</Text>
            </>
          )}
        </TouchableOpacity>
      );
    },
    [busy, clearError, colors.primary, purchasing, selectedProductId, styles],
  );

  if (!clubId) {
    return null;
  }

  if (statusLoading && !status) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredFill}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (statusError && !status) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredFill}>
          <Text style={styles.errorText}>{statusError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
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

            {billingState === 'active_cancelled' && (
              <Text style={[styles.warningNote, {color: colors.warning}]}>
                Your Pro access will end when the current period expires.
                Re-subscribe any time to keep it active.
              </Text>
            )}

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

        {(billingState === 'free' || billingState === 'expired') && (
          <>
            <Text style={styles.headline}>
              {billingState === 'expired'
                ? 'Re-subscribe to Club Pro'
                : 'Upgrade to Club Pro'}
            </Text>
            <Text style={styles.tagline}>
              Unlock the full potential of your club
            </Text>
          </>
        )}

        <View style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>
            Everything you need to run your club better
          </Text>
          <Text style={styles.featuresSubtitle}>
            Upgrade to Club Pro to unlock powerful tools for managing your
            club.
          </Text>
          {PRO_FEATURES.map(f => (
            <Text key={f} style={styles.featureItem}>
              {f}
            </Text>
          ))}
        </View>

        {(billingState === 'free' || billingState === 'expired') && (
          <>
            {!!purchaseError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{purchaseError}</Text>
                <TouchableOpacity
                  onPress={clearError}
                  hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                  <Text style={styles.errorBannerDismiss}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.plansSection}>
              <Text style={styles.plansLabel}>Choose a plan</Text>

              {loadingProducts ? (
                <View style={styles.loadingPlansWrap}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.loadingPlansText}>
                    Loading subscription plans...
                  </Text>
                </View>
              ) : products.length > 0 ? (
                <View style={styles.planList}>
                  {yearlyProduct
                    ? renderPlanCard(
                        yearlyProduct,
                        'Best value for ongoing clubs',
                        !!monthlyProduct,
                      )
                    : null}

                  {monthlyProduct
                    ? renderPlanCard(
                        monthlyProduct,
                        'Flexible month-to-month billing',
                      )
                    : null}
                </View>
              ) : (
                <View style={styles.emptyProducts}>
                  <Text style={styles.emptyProductsText}>
                    Plans are temporarily unavailable.
                  </Text>
                  <Text style={styles.emptyProductsSub}>
                    Please try again later or restore an existing purchase.
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (!selectedProductId || busy || loadingProducts) &&
                  styles.primaryBtnDisabled,
              ]}
              activeOpacity={0.85}
              disabled={!selectedProductId || busy || loadingProducts}
              onPress={handlePurchase}>
              {purchasing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {billingState === 'expired'
                    ? 'Re-subscribe to Pro'
                    : 'Get Club Pro'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, busy && styles.planCardDisabled]}
              activeOpacity={0.8}
              disabled={busy}
              onPress={handleRestore}>
              {restoring ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.secondaryBtnText}>
                  Restore previous purchase
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {isActiveState && (
          <TouchableOpacity
            style={styles.manageBtn}
            activeOpacity={0.8}
            onPress={handleManageSubscription}>
            <Text style={styles.manageBtnText}>Manage subscription</Text>
          </TouchableOpacity>
        )}

        <View style={styles.legalBlock}>
          <Text style={styles.legalText}>
            Payment will be charged to your Apple ID account at confirmation of
            purchase.
          </Text>
          <Text style={styles.legalText}>
            Subscription automatically renews unless it is canceled at least 24
            hours before the end of the current period.
          </Text>
          <Text style={styles.legalText}>
            Your account will be charged for renewal within 24 hours prior to
            the end of the current period.
          </Text>
          <Text style={styles.legalText}>
            You can manage and cancel your subscriptions in your Apple ID
            account settings.
          </Text>
          <View style={styles.legalLinks}>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(
                  'https://cleanutilityapps.com/passeo/privacy/',
                )
              }
              hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.legalLinkSep}>·</Text>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(
                  'https://cleanutilityapps.com/passeo/terms/',
                )
              }
              hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}>
              <Text style={styles.legalLink}>Terms of Use</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    scroll: {
      padding: 20,
      paddingBottom: 48,
    },

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
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    statusLabel: {
      color: c.text,
      fontSize: 15,
      fontWeight: '700',
    },

    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
    },
    detailLabel: {
      color: c.textMuted,
      fontSize: 13,
      flex: 1,
    },
    detailValue: {
      color: c.text,
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
      textAlign: 'right',
    },
    warningNote: {
      fontSize: 13,
      lineHeight: 20,
      marginTop: 2,
    },

    featuresCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 20,
      gap: 10,
    },
    featuresTitle: {
      color: c.text,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    featuresSubtitle: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 10,
    },
    featureItem: {
      color: c.text,
      fontSize: 16,
      lineHeight: 24,
    },

    errorBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 16,
    },
    errorBannerText: {
      color: c.text,
      fontSize: 14,
      lineHeight: 20,
      flex: 1,
    },
    errorBannerDismiss: {
      color: c.textMuted,
      fontSize: 16,
      fontWeight: '700',
    },

    plansSection: {
      marginBottom: 18,
    },
    plansLabel: {
      color: c.text,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 12,
    },
    loadingPlansWrap: {
      paddingVertical: 24,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    loadingPlansText: {
      color: c.textMuted,
      fontSize: 14,
    },
    planList: {
      gap: 12,
    },
    planCard: {
      position: 'relative',
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    planCardSelected: {
      borderColor: c.primary,
    },
    planCardDisabled: {
      opacity: 0.7,
    },
    planHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    planTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '700',
    },
    planPrice: {
      color: c.text,
      fontSize: 22,
      fontWeight: '800',
      marginBottom: 6,
    },
    planSubtitle: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    planSpinner: {
      marginTop: 6,
      alignSelf: 'flex-start',
    },
    planBadge: {
      position: 'absolute',
      top: -10,
      right: 14,
      backgroundColor: '#F4B400',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
      zIndex: 1,
    },
    planBadgeText: {
      color: '#000000',
      fontSize: 12,
      fontWeight: '800',
    },

    radioOuter: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterSelected: {
      borderColor: c.primary,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.primary,
    },

    emptyProducts: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      gap: 6,
    },
    emptyProductsText: {
      color: c.text,
      fontSize: 15,
      fontWeight: '700',
    },
    emptyProductsSub: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },

    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      paddingHorizontal: 16,
    },
    primaryBtnDisabled: {
      opacity: 0.5,
    },
    primaryBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
    },

    secondaryBtn: {
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    secondaryBtnText: {
      color: c.primary,
      fontSize: 16,
      fontWeight: '700',
    },

    manageBtn: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
      paddingHorizontal: 16,
    },
    manageBtnText: {
      color: c.text,
      fontSize: 15,
      fontWeight: '700',
    },

    legalBlock: {
      marginTop: 8,
      marginBottom: 8,
      gap: 10,
    },
    legalText: {
      color: c.textMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },
    legalLinks: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    legalLink: {
      color: c.primary,
      fontSize: 13,
      fontWeight: '600',
      textDecorationLine: 'underline',
      paddingVertical: 6,
    },
    legalLinkSep: {
      color: c.textMuted,
      fontSize: 13,
    },
  });
}
