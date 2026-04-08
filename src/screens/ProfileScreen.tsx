import React from 'react';
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
import {CLUB_PRO_CONFIG} from '../config/appConfig';

type Props = {navigation: any};

export default function ProfileScreen({navigation}: Props) {
  const {currentMembership, currentClub} = useApp();

  if (!currentMembership || !currentClub) {
    return null;
  }

  const role = currentMembership.role;
  const isAdminOrOwner = ['admin', 'owner'].includes(role);
  const canManageClub = ['host', 'admin', 'owner'].includes(role);

  // Club Pro gating — flip CLUB_PRO_CONFIG.IS_PRO when billing is ready
  const isClubPro = CLUB_PRO_CONFIG.IS_PRO;
  const goProGate = () => navigation.navigate('ClubProPreview');
  // TODO: club_click_reports_locked / club_click_audit_logs_locked events here

  const ROLE_LABELS: Record<string, string> = {
    member: 'Member',
    host: 'Host',
    admin: 'Admin',
    owner: 'Owner',
  };

  const handleTransferOwnership = () => {
    Alert.alert(
      'Transfer Ownership',
      'This feature will allow you to transfer club ownership. (Coming soon)',
    );
  };

  const handleOpenBackfill = () => {
    navigation.navigate('BackfillSessions');
  };

  const backfillTitle =
    role === 'member' ? 'Missed Check-Ins' : 'Backfill Sessions';

  const backfillDescription =
    role === 'member'
      ? 'Complete eligible past session check-ins.'
      : 'Manage and perform backfill check-ins.';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ===== HEADER SUMMARY ===== */}
        <View style={styles.summaryCard}>
          <Text style={styles.userName}>{currentMembership.userName}</Text>
          <Text style={styles.userSub}>{currentClub.name}</Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Role</Text>
              <Text style={styles.summaryValue}>
                {ROLE_LABELS[role] ?? role}
              </Text>
            </View>

            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Credits</Text>
              <Text style={styles.summaryValue}>
                {currentMembership.credits}
              </Text>
            </View>
          </View>
        </View>

        {/* ===== CLUB ===== */}
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

        {/* ===== QUICK ACTIONS ===== */}
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

          <View style={styles.actionDivider} />

          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => navigation.navigate('CreditHistory')}>
            <Text style={styles.actionItemText}>Credit History</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ===== BACKFILL (重点功能入口) ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Backfill</Text>

          <TouchableOpacity
            style={styles.highlightAction}
            onPress={handleOpenBackfill}>
            <View style={{flex: 1}}>
              <Text style={styles.highlightTitle}>{backfillTitle}</Text>
              <Text style={styles.highlightDesc}>{backfillDescription}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ===== ADMIN ===== */}
        {canManageClub && (
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

            <View style={styles.actionDivider} />

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() =>
                isClubPro ? navigation.navigate('Reports') : goProGate()
              }>
              <Text style={styles.actionItemText}>Reports</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.actionDivider} />

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => navigation.navigate('MemberCredits')}>
              <Text style={styles.actionItemText}>Manage Members</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.actionDivider} />
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() =>
                isClubPro ? navigation.navigate('AuditLog') : goProGate()
              }>
              <Text style={styles.actionItemText}>Audit Log</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ===== OWNER ===== */}
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

        {/* ===== RECOVERY CODE ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recovery Code</Text>
          <Text style={styles.metaDesc}>
            Use this code to restore access to your membership if you lose or
            change your device. Keep it somewhere safe.
          </Text>
          <Text style={styles.recoveryCode}>
            {currentMembership.recoveryCode || '—'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  scroll: {padding: 20, paddingBottom: 40},

  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  userSub: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#8E8E93',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
    color: '#1C1C1E',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
    marginBottom: 10,
    textTransform: 'uppercase',
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {fontSize: 14, color: '#8E8E93'},
  infoValue: {fontSize: 14, fontWeight: '600', color: '#1C1C1E'},
  joinCode: {color: '#007AFF'},

  actionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
  },

  highlightAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  highlightTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  highlightDesc: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },

  actionItemText: {
    fontSize: 15,
    color: '#1C1C1E',
  },

  chevron: {
    fontSize: 22,
    color: '#C7C7CC',
  },

  dangerText: {
    color: '#FF3B30',
  },

  metaText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  metaDesc: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
    lineHeight: 18,
  },
  recoveryCode: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: 2,
    marginTop: 12,
    fontVariant: ['tabular-nums'],
  },
});
