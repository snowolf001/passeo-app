// src/components/UpgradeProModal.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useAppTheme} from '../theme/useAppTheme';
import {StoreProduct, useClubProPurchase} from '../hooks/useClubProPurchase';

type Props = {
  visible: boolean;
  clubId: string;
  onClose: () => void;
  onPurchased?: () => void | Promise<void>;
};

export default function UpgradeProModal({
  visible,
  clubId,
  onClose,
  onPurchased,
}: Props) {
  const {colors} = useAppTheme();

  const {
    products,
    loadingProducts,
    purchasing,
    restoring,
    error,
    clearError,
    purchase,
    restore,
  } = useClubProPurchase({skip: !visible});

  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const monthlyProduct = useMemo(
    () => products.find(p => p.planCycle === 'monthly') ?? null,
    [products],
  );

  const yearlyProduct = useMemo(
    () => products.find(p => p.planCycle === 'yearly') ?? null,
    [products],
  );

  useEffect(() => {
    if (!visible) {
      setSelectedProductId(null);
      setActionError(null);
      clearError();
      return;
    }

    setActionError(null);
  }, [visible, clearError]);

  useEffect(() => {
    if (!visible) return;

    const currentExists = !!products.find(
      p => p.productId === selectedProductId,
    );

    if (currentExists) {
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
  }, [visible, products, selectedProductId, monthlyProduct, yearlyProduct]);

  const busy = purchasing || restoring;
  const displayError = actionError ?? error;

  const canPurchase =
    visible &&
    !loadingProducts &&
    !busy &&
    !!selectedProductId &&
    products.length > 0 &&
    !!clubId;

  const handleSelect = (product: StoreProduct) => {
    if (busy) return;
    setSelectedProductId(product.productId);
    setActionError(null);
    clearError();
  };

  const handlePurchase = async () => {
    if (!selectedProductId || !clubId || busy) {
      return;
    }

    try {
      setActionError(null);
      clearError();

      await purchase(selectedProductId, clubId);

      if (onPurchased) {
        await onPurchased();
      }

      onClose();
    } catch (e: any) {
      if (e?.message === 'USER_CANCELLED') {
        return;
      }

      setActionError(e?.message ?? 'Purchase failed.');
    }
  };

  const handleRestore = async () => {
    if (!clubId || busy) {
      return;
    }

    try {
      setActionError(null);
      clearError();

      const result = await restore(clubId);

      if (result.status?.isPro) {
        if (onPurchased) {
          await onPurchased();
        }
        onClose();
        return;
      }

      if (result.verifiedCount === 0) {
        setActionError(
          'No previous subscription purchase was found to restore.',
        );
        return;
      }

      if (result.verifyFailed) {
        setActionError('Restore found a purchase, but verification failed.');
        return;
      }

      setActionError('Restore did not activate Club Pro.');
    } catch (e: any) {
      setActionError(e?.message ?? 'Restore failed.');
    }
  };

  const renderPlanCard = (
    product: StoreProduct,
    subtitle: string,
    bestValue?: boolean,
  ) => {
    const selected = selectedProductId === product.productId;

    return (
      <TouchableOpacity
        key={product.productId}
        activeOpacity={0.9}
        onPress={() => handleSelect(product)}
        disabled={busy}
        style={[
          styles.planCard,
          {
            backgroundColor: colors.card,
            borderColor: selected ? colors.primary : colors.border,
            opacity: busy ? 0.7 : 1,
          },
        ]}>
        {bestValue ? (
          <View style={styles.planBadge}>
            <Text style={styles.planBadgeText}>Best value</Text>
          </View>
        ) : null}
        <View style={styles.planHeader}>
          <Text style={[styles.planTitle, {color: colors.text}]}>
            {product.planCycle === 'yearly' ? 'Yearly' : 'Monthly'}
          </Text>
          <View
            style={[
              styles.radioOuter,
              {
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}>
            {selected ? (
              <View
                style={[
                  styles.radioInner,
                  {
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            ) : null}
          </View>
        </View>

        <Text style={[styles.planPrice, {color: colors.text}]}>
          {product.localizedPrice || 'See store price'}
        </Text>

        <Text style={[styles.planSubtitle, {color: colors.textMuted}]}>
          {subtitle}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={busy ? undefined : onClose}
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, {color: colors.text}]}>
              Get Club Pro
            </Text>

            <TouchableOpacity
              onPress={onClose}
              disabled={busy}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Text
                style={[
                  styles.closeText,
                  {color: busy ? colors.textMuted : colors.text},
                ]}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, {color: colors.textMuted}]}>
            Unlock reports, audit tools, and other Pro features for your club.
          </Text>

          <View style={styles.features}>
            <Text style={[styles.featureText, {color: colors.text}]}>
              • Reports and analytics
            </Text>
            <Text style={[styles.featureText, {color: colors.text}]}>
              • Audit log access
            </Text>
            <Text style={[styles.featureText, {color: colors.text}]}>
              • Club-level Pro for all members
            </Text>
          </View>

          <Text style={[styles.sectionTitle, {color: colors.text}]}>
            Choose a plan
          </Text>

          {loadingProducts ? (
            <View style={styles.centerState}>
              <ActivityIndicator />
              <Text style={[styles.stateText, {color: colors.textMuted}]}>
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
            <View
              style={[
                styles.emptyState,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}>
              <Text style={[styles.emptyTitle, {color: colors.text}]}>
                No plans available
              </Text>
              <Text style={[styles.emptyText, {color: colors.textMuted}]}>
                Subscription plans could not be loaded from the store right now.
              </Text>
            </View>
          )}

          {displayError ? (
            <View
              style={[
                styles.errorBox,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}>
              <Text style={[styles.errorText, {color: colors.text}]}>
                {displayError}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handlePurchase}
            disabled={!canPurchase}
            style={[
              styles.primaryButton,
              {
                backgroundColor: canPurchase ? colors.primary : colors.border,
              },
            ]}>
            {purchasing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Get Club Pro</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleRestore}
            disabled={busy || loadingProducts || !clubId}
            style={styles.restoreButton}>
            {restoring ? (
              <ActivityIndicator />
            ) : (
              <Text style={[styles.restoreText, {color: colors.primary}]}>
                Restore purchase
              </Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.footerText, {color: colors.textMuted}]}>
            Subscription applies to the whole club. Payment and renewal are
            handled by the App Store or Google Play.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    minHeight: 480,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  closeText: {
    fontSize: 20,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
  },
  features: {
    marginTop: 18,
    gap: 8,
  },
  featureText: {
    fontSize: 15,
    lineHeight: 20,
  },
  sectionTitle: {
    marginTop: 22,
    marginBottom: 12,
    fontSize: 16,
    fontWeight: '700',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  stateText: {
    fontSize: 14,
  },
  planList: {
    gap: 12,
  },
  planCard: {
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 16,
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
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  planPrice: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '800',
  },
  planSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  errorBox: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  restoreButton: {
    marginTop: 14,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreText: {
    fontSize: 15,
    fontWeight: '600',
  },
  footerText: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
