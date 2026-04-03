import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../context/AppContext';
import {clubService} from '../services/clubService';
import {ClubSubscription} from '../types';

type Props = {navigation: any};

export default function ProfileScreen({navigation}: Props) {
  const {currentUser, currentMembership, currentClub} = useApp();
  const [subscription, setSubscription] = useState<ClubSubscription | null>(
    null,
  );

  const loadSubscription = useCallback(async () => {
    if (!currentMembership) return;
    const sub = await clubService.getSubscription(currentMembership.clubId);
    setSubscription(sub);
  }, [currentMembership]);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  if (!currentUser || !currentMembership || !currentClub) {
    return null;
  }

  const role = currentMembership.role;
  const isAdminOrOwner = ['admin', 'owner'].includes(role);
  const canAccessBackfill =
    role === 'member' ||
    role === 'host' ||
    role === 'admin' ||
    role === 'owner';

  const ROLE_LABELS: Record<string, string> = {
    member: 'Member',
    host: 'Host',
    admin: 'Admin',
    owner: 'Owner',
  };

  const handleTransferOwnership = () => {
    Alert.alert(
      'Transfer Ownership',
      'This feature will allow you to transfer club ownership to another member. (Coming soon)',
    );
  };

  const handleOpenBackfill = () => {
    navigation.navigate('BackfillSessions');
  };

  const backfillTitle =
    role === 'member' ? 'Missed Check-Ins' : 'Backfill Sessions';

  const backfillDescription =
    role === 'member'
      ? 'View past sessions and complete eligible self backfill check-ins.'
      : 'View past sessions and perform eligible backfill check-ins.';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle}>Profile</Text>

        <View style={styles.card}>
          <Text style={styles.userName}>{currentUser.name}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValue}>{ROLE_LABELS[role] ?? role}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Credits</Text>
            <Text style={styles.infoValue}>{currentMembership.credits}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Member ID</Text>
            <Text style={styles.infoValue}>{currentMembership.memberCode}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Recovery Code</Text>
            <Text style={styles.infoValue}>
              {currentMembership.recoveryCode}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Club</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{currentClub.name}</Text>
          </View>
          {isAdminOrOwner && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Join Code</Text>
              <Text style={[styles.infoValue, styles.joinCode]}>
                {currentClub.joinCode}
              </Text>
            </View>
          )}
        </View>

        {subscription && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Subscription</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Plan</Text>
              <Text style={styles.infoValue}>
                {subscription.plan.charAt(0).toUpperCase() +
                  subscription.plan.slice(1)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Expires</Text>
              <Text style={styles.infoValue}>
                {new Date(subscription.expiresAt).toLocaleDateString([], {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.actionItem}
            onPress={() =>
              navigation.navigate('AttendanceHistory', {
                membershipId: currentMembership.id,
                title: 'My History',
              })
            }>
            <Text style={styles.actionItemText}>My History</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {canAccessBackfill && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Backfill</Text>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={handleOpenBackfill}>
              <View style={styles.actionTextBlock}>
                <Text style={styles.actionItemText}>{backfillTitle}</Text>
                <Text style={styles.actionItemSubtext}>
                  {backfillDescription}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {isAdminOrOwner && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Club Management</Text>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => navigation.navigate('ClubSettings')}>
              <Text style={styles.actionItemText}>
                Club Settings & Locations
              </Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {role === 'owner' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ownership</Text>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={handleTransferOwnership}>
              <Text style={[styles.actionItemText, styles.dangerText]}>
                Transfer Ownership
              </Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  scroll: {padding: 20, paddingBottom: 40},
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  infoLabel: {fontSize: 14, color: '#8E8E93'},
  infoValue: {fontSize: 14, fontWeight: '600', color: '#1C1C1E'},
  joinCode: {color: '#007AFF'},
  actionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  actionTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  actionItemText: {fontSize: 15, color: '#1C1C1E'},
  actionItemSubtext: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#8E8E93',
  },
  dangerText: {color: '#FF3B30'},
  chevron: {fontSize: 22, color: '#C7C7CC'},
});
