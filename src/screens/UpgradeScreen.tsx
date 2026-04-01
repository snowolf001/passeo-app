import {
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Product} from 'react-native-iap';
import {ProGateParams} from '../navigation/proGate';
import {RootStackParamList} from '../navigation/types';
import {
  getProducts,
  initIap,
  isIapReady,
  PRO_LIFETIME_SKU,
  purchasePro,
  restorePurchases,
  syncProStatusFromStore,
} from '../services/iap';
import {useAppTheme} from '../theme/useAppTheme';

// ─── Design tokens ────────────────────────────────────────────────────────────

const SPACING = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 28,
  xl: 40,
  xxl: 64,
};

const RADIUS = {
  card: 16,
  button: 14,
};

const GREEN = {
  button: '#16A34A',
  buttonSubtle: '#16A34A',
};

// ─── Feature items ─────────────────────────────────────────────────────────────

const PRO_FEATURES = ['Custom report branding', 'Cleaner export format'];

// ─── Small components ──────────────────────────────────────────────────────────

function FeatureItem({
  label,
  textColor,
  checkColor,
  dividerColor,
  isLast,
}: {
  label: string;
  textColor: string;
  checkColor: string;
  dividerColor: string;
  isLast: boolean;
}) {
  return (
    <View
      style={[
        styles.featureRow,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: dividerColor,
        },
      ]}>
      <Text style={[styles.featureCheck, {color: checkColor}]}>✓</Text>
      <Text style={[styles.featureLabel, {color: textColor}]}>{label}</Text>
    </View>
  );
}

function isNonResumableAction(kind?: string): boolean {
  return kind === 'open_report_history' || kind === 'view_report_history';
}

export default function UpgradeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Upgrade'>>();
  const theme = useAppTheme();

  const proGate = route.params?.proGate as ProGateParams | undefined;
  const actionKind = (proGate as any)?.action?.kind as string | undefined;
  const nonResumable = isNonResumableAction(actionKind);

  const purchaseRefreshTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const restoreRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [loadingStore, setLoadingStore] = useState(true);
  const [refreshingPro, setRefreshingPro] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [storeReady, setStoreReady] = useState(false);
  const [storeError, setStoreError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [product, setProduct] = useState<Product | null>(null);
  const [isPro, setIsPro] = useState(false);

  const colors = useMemo(() => {
    const bg =
      (theme as any)?.colors?.background ??
      (theme as any)?.colors?.surface ??
      '#0B0B0C';

    const card =
      (theme as any)?.colors?.card ??
      (theme as any)?.colors?.surface ??
      '#121214';

    const textPrimary =
      (theme as any)?.colors?.text ??
      (theme as any)?.colors?.onSurface ??
      '#FFFFFF';

    const textSecondary =
      (theme as any)?.colors?.textMuted ??
      (theme as any)?.colors?.textSecondary ??
      (theme as any)?.colors?.placeholder ??
      '#6B7280';

    const divider =
      (theme as any)?.colors?.border ??
      (theme as any)?.colors?.outline ??
      'rgba(255,255,255,0.10)';

    const isDark =
      typeof bg === 'string' &&
      (bg.startsWith('#0') ||
        bg.startsWith('#1') ||
        bg.startsWith('#2') ||
        bg.startsWith('#3') ||
        bg.startsWith('rgb(0') ||
        bg.startsWith('rgba(0'));

    return {
      background: bg,
      card,
      textPrimary,
      textSecondary,
      divider,
      statusBar: isDark
        ? ('light-content' as const)
        : ('dark-content' as const),
    };
  }, [theme]);

  const clearRefreshTimeouts = useCallback(() => {
    if (purchaseRefreshTimeoutRef.current) {
      clearTimeout(purchaseRefreshTimeoutRef.current);
      purchaseRefreshTimeoutRef.current = null;
    }

    if (restoreRefreshTimeoutRef.current) {
      clearTimeout(restoreRefreshTimeoutRef.current);
      restoreRefreshTimeoutRef.current = null;
    }
  }, []);

  const refreshProStatus = useCallback(async () => {
    try {
      setRefreshingPro(true);
      const pro = await syncProStatusFromStore(true);
      console.log('[UpgradeScreen] Pro status refreshed:', pro);
      setIsPro(pro === true);
      return pro === true;
    } catch (error) {
      console.warn('[UpgradeScreen] Failed to refresh Pro status', error);
      setIsPro(false);
      return false;
    } finally {
      setRefreshingPro(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadStore = async () => {
      try {
        setLoadingStore(true);
        setStoreError(false);

        await initIap();
        const products = await getProducts();
        const proProduct =
          products.find(p => p.productId === PRO_LIFETIME_SKU) ?? null;

        const pro = await syncProStatusFromStore(true);

        if (!cancelled) {
          setProduct(proProduct);

          const ready = isIapReady() && !!proProduct;
          setStoreReady(ready);
          setStoreError(!ready && !pro);
          setIsPro(pro === true);
        }
      } catch (error) {
        console.warn('[UpgradeScreen] Failed to load store', error);
        if (!cancelled) {
          setStoreReady(false);
          setProduct(null);
          setStoreError(true);
          setIsPro(false);
        }
      } finally {
        if (!cancelled) {
          setLoadingStore(false);
          setRefreshingPro(false);
        }
      }
    };

    void loadStore();

    return () => {
      cancelled = true;
      clearRefreshTimeouts();
    };
  }, [clearRefreshTimeouts, retryCount]);

  useFocusEffect(
    useCallback(() => {
      void refreshProStatus();
    }, [refreshProStatus]),
  );

  const displayedPrice = product?.localizedPrice ?? null;

  const handleRetry = () => {
    setRetryCount(c => c + 1);
  };

  const handleContinueFree = () => {
    if (nonResumable) {
      navigation.goBack();
      return;
    }

    if (proGate?.originRouteName) {
      navigation.navigate({
        name: proGate.originRouteName as any,
        params: {
          ...(proGate.originParams ?? {}),
          resumeProAction: proGate.action,
          resumeToken: String(Date.now()),
          skipUpgradeOnce: true,
        },
        merge: true,
      } as any);
      return;
    }

    navigation.goBack();
  };

  const handlePurchase = async () => {
    if (purchasing || isPro) {
      return;
    }

    if (!storeReady) {
      Alert.alert(
        'Store Unavailable',
        'Google Play is not ready yet. Please try again in a moment.',
      );
      return;
    }

    try {
      setPurchasing(true);
      clearRefreshTimeouts();

      await purchasePro();

      await refreshProStatus();

      purchaseRefreshTimeoutRef.current = setTimeout(() => {
        void refreshProStatus();
      }, 1200);
    } catch (error) {
      console.warn('[UpgradeScreen] Purchase failed', error);
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (restoring || isPro) {
      return;
    }

    if (!isIapReady()) {
      Alert.alert(
        'Store Unavailable',
        'Google Play is not ready yet. Please try again in a moment.',
      );
      return;
    }

    try {
      setRestoring(true);
      clearRefreshTimeouts();

      await restorePurchases();
      await refreshProStatus();

      restoreRefreshTimeoutRef.current = setTimeout(() => {
        void refreshProStatus();
      }, 800);
    } catch (error) {
      console.warn('[UpgradeScreen] Restore failed', error);
    } finally {
      setRestoring(false);
    }
  };

  const showLoading = loadingStore || refreshingPro;

  const renderFeatureCard = () => (
    <View style={[styles.featureCard, {backgroundColor: colors.card}]}>
      <Text style={[styles.featureCardTitle, {color: colors.textPrimary}]}>
        What you get with Pro
      </Text>

      {PRO_FEATURES.map((label, index) => (
        <FeatureItem
          key={label}
          label={label}
          textColor={colors.textPrimary}
          checkColor={GREEN.button}
          dividerColor={colors.divider}
          isLast={index === PRO_FEATURES.length - 1}
        />
      ))}
    </View>
  );

  const renderErrorState = () => (
    <>
      {renderFeatureCard()}

      <View style={styles.errorBlock}>
        <Text style={[styles.errorHeading, {color: colors.textPrimary}]}>
          Unable to load purchase options.
        </Text>
        <Text style={[styles.errorBody, {color: colors.textSecondary}]}>
          Please check your connection and try again.
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          activeOpacity={0.8}
          onPress={handleRetry}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.restoreButton}
          activeOpacity={0.7}
          disabled={restoring}
          onPress={handleRestore}>
          <Text
            style={[styles.restoreButtonText, {color: colors.textSecondary}]}>
            {restoring ? 'Restoring…' : 'Restore Purchases'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.ghostButton}
        activeOpacity={0.6}
        onPress={handleContinueFree}>
        <Text style={[styles.ghostButtonText, {color: colors.textSecondary}]}>
          {nonResumable ? 'Go Back' : 'Continue in Free Mode'}
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderProState = () => (
    <>
      {renderFeatureCard()}

      <View style={styles.messageBlock}>
        <Text style={[styles.messageHeading, {color: colors.textPrimary}]}>
          You already have Pro.
        </Text>
        <Text style={[styles.messageBody, {color: colors.textSecondary}]}>
          All features are unlocked.
        </Text>
      </View>

      <View style={styles.ctaBlock}>
        <View
          accessibilityRole="button"
          accessibilityState={{disabled: true}}
          style={[styles.primaryButton, styles.proActiveButton]}>
          <Text style={styles.primaryButtonText}>✓ Pro Active</Text>
        </View>
      </View>
    </>
  );

  const renderFreeState = () => (
    <>
      {renderFeatureCard()}

      <View style={styles.messageBlock}>
        <Text style={[styles.messageBody, {color: colors.textSecondary}]}>
          Free mode still works end-to-end.
        </Text>
        <Text style={[styles.messageBody, {color: colors.textSecondary}]}>
          Upgrade to Pro for unlimited photos, custom reports, and cleaner
          exports.
        </Text>
      </View>

      <View style={styles.ctaBlock}>
        {displayedPrice !== null && (
          <>
            <Text style={[styles.priceLabel, {color: colors.textPrimary}]}>
              {displayedPrice}
            </Text>
            <Text style={[styles.priceNote, {color: colors.textSecondary}]}>
              One-time purchase · No subscription
            </Text>
          </>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, purchasing && styles.buttonInProgress]}
          activeOpacity={0.8}
          disabled={!storeReady || purchasing}
          onPress={handlePurchase}>
          <Text style={styles.primaryButtonText}>
            {purchasing ? 'Processing…' : 'Upgrade to Pro'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.restoreButton}
          activeOpacity={0.7}
          disabled={restoring}
          onPress={handleRestore}>
          <Text
            style={[styles.restoreButtonText, {color: colors.textSecondary}]}>
            {restoring ? 'Restoring…' : 'Restore Purchases'}
          </Text>
        </TouchableOpacity>

        {!storeReady && (
          <Text style={[styles.storeNote, {color: colors.textSecondary}]}>
            Store not available yet. Real purchases require a Google Play
            install.
          </Text>
        )}

        <TouchableOpacity
          style={styles.ghostButton}
          activeOpacity={0.6}
          onPress={handleContinueFree}>
          <Text style={[styles.ghostButtonText, {color: colors.textSecondary}]}>
            {nonResumable ? 'Go Back' : 'Continue in Free Mode'}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.background}]}>
      <StatusBar barStyle={colors.statusBar} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, {color: colors.textPrimary}]}>
            Passeo Pro
          </Text>
          {!isPro && (
            <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
              Unlock cleaner reports and fewer limits.
            </Text>
          )}
        </View>

        {showLoading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={GREEN.button} />
            <Text style={[styles.loadingText, {color: colors.textSecondary}]}>
              Loading…
            </Text>
          </View>
        ) : isPro ? (
          renderProState()
        ) : storeError ? (
          renderErrorState()
        ) : (
          renderFreeState()
        )}

        <Text style={[styles.disclaimer, {color: colors.textSecondary}]}>
          Passeo helps you organize documentation. It does not provide legal
          advice or certification.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },

  header: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xs,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    opacity: 0.75,
  },

  featureCard: {
    borderRadius: RADIUS.card,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },
  featureCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    opacity: 0.5,
    marginBottom: SPACING.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
  },
  featureCheck: {
    fontSize: 15,
    fontWeight: '700',
    marginRight: 12,
    width: 18,
    textAlign: 'center',
  },
  featureLabel: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    flex: 1,
  },

  messageBlock: {
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xs,
  },
  messageHeading: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    marginBottom: 4,
  },
  messageBody: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
    opacity: 0.8,
  },

  ctaBlock: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  priceLabel: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 2,
  },
  priceNote: {
    fontSize: 13,
    marginBottom: SPACING.md,
    opacity: 0.6,
  },
  primaryButton: {
    width: '100%',
    height: 52,
    borderRadius: RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GREEN.button,
    marginBottom: SPACING.sm,
  },
  buttonInProgress: {
    backgroundColor: '#1e7a3c',
    opacity: 0.9,
  },
  proActiveButton: {
    backgroundColor: GREEN.buttonSubtle,
    opacity: 0.78,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  restoreButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  restoreButtonText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  storeNote: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    opacity: 0.55,
    marginTop: 4,
    paddingHorizontal: SPACING.xs,
  },
  ghostButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: SPACING.xs,
  },
  ghostButtonText: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },

  loadingBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.xs,
  },
  loadingText: {
    fontSize: 13,
    marginTop: SPACING.xs,
  },

  errorBlock: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  errorHeading: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  errorBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: SPACING.md,
  },
  retryButton: {
    width: '100%',
    height: 52,
    borderRadius: RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GREEN.button,
    marginBottom: SPACING.sm,
  },
  retryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  disclaimer: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    opacity: 0.4,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
});
