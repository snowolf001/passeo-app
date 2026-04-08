// Temporary MVP placeholder paywall for Club Pro features.
// Real IAP / billing is not implemented yet.
// This screen validates user intent during closed testing.

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

// TODO: replace with real analytics when available
// Tracking intent events: club_click_upgrade_placeholder

type Props = {navigation: any};

const PRO_FEATURES = [
  {icon: '📊', label: 'Reports'},
  {icon: '📄', label: 'PDF Export'},
  {icon: '👤', label: 'Member History'},
  {icon: '🗓', label: 'Audit Logs'},
  {icon: '📋', label: 'Unlimited Session History'},
];

export default function ClubProPreviewScreen({navigation}: Props) {
  const handleUpgradePress = () => {
    Alert.alert(
      'Coming Soon',
      'Club Pro billing is not enabled yet. We appreciate your interest!',
      [{text: 'OK'}],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badgeWrap}>
            <Text style={styles.badge}>PRO</Text>
          </View>
          <Text style={styles.title}>Upgrade to Club Pro</Text>
          <Text style={styles.subtitle}>
            Pro features are coming soon. During closed testing, this page helps
            us validate which features users want most.
          </Text>
        </View>

        {/* Feature list */}
        <View style={styles.featureCard}>
          <Text style={styles.featureCardTitle}>What's included</Text>
          {PRO_FEATURES.map((f, i) => (
            <View
              key={f.label}
              style={[
                styles.featureRow,
                i < PRO_FEATURES.length - 1 && styles.featureRowBorder,
              ]}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={styles.featureLabel}>{f.label}</Text>
              <Text style={styles.featureCheck}>✓</Text>
            </View>
          ))}
        </View>

        {/* Note */}
        <Text style={styles.note}>
          Your current app functionality is not affected. Core club operations
          remain available.
        </Text>

        {/* Primary CTA */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleUpgradePress}>
          <Text style={styles.primaryBtnText}>
            Upgrade to Pro (Coming Soon)
          </Text>
        </TouchableOpacity>

        {/* Secondary */}
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryBtnText}>Not now</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  scroll: {padding: 24, paddingBottom: 48},

  header: {alignItems: 'center', marginBottom: 28},
  badgeWrap: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  badge: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
  },

  featureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  featureCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  featureRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  featureIcon: {fontSize: 18, marginRight: 12},
  featureLabel: {flex: 1, fontSize: 15, color: '#1C1C1E', fontWeight: '500'},
  featureCheck: {fontSize: 16, color: '#34C759', fontWeight: '700'},

  note: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 19,
    paddingHorizontal: 8,
  },

  primaryBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#8E8E93',
    fontSize: 15,
    fontWeight: '500',
  },
});
