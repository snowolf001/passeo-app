import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Clipboard,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../context/AppContext';
import {CLUB_PRO_CONFIG} from '../config/appConfig';
import {leaveClub} from '../services/api/clubApi';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';

type Props = {navigation: any};

export default function ProfileScreen({navigation}: Props) {
  const {currentMembership, currentClub, clearMembershipSession} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSnackbar = useCallback((message: string) => {
    if (snackTimer.current) {
      clearTimeout(snackTimer.current);
    }
    setSnackMsg(message);
    setSnackVisible(true);
    snackTimer.current = setTimeout(() => {
      setSnackVisible(false);
      setSnackMsg('');
    }, 2500);
  }, []);

  if (!currentMembership || !currentClub) {
    return null;
  }

  const role = currentMembership.role;
  const isOwnerOrHost = ['host', 'owner'].includes(role);
  const canManageClub = ['host', 'owner'].includes(role);

  // Club Pro gating — flip CLUB_PRO_CONFIG.IS_PRO when billing is ready
  const isClubPro = CLUB_PRO_CONFIG.IS_PRO;
  const goProGate = () => navigation.navigate('ClubProPreview');
  // TODO: club_click_reports_locked / club_click_audit_logs_locked events here

  const ROLE_LABELS: Record<string, string> = {
    member: 'Member',
    host: 'Host',
    owner: 'Owner',
  };

  const handleTransferOwnership = () => {
    Alert.alert(
      'Transfer Ownership',
      'This feature will allow you to transfer club ownership. (Coming soon)',
    );
  };

  const handleLeaveClub = () => {
    if (role === 'owner') {
      Alert.alert(
        'Cannot Leave',
        'Owners must transfer ownership before leaving this club.',
      );
      return;
    }
    Alert.alert(
      'Leave Club',
      `Leave ${currentClub.name}? You will need to rejoin with a code.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveClub(currentMembership.clubId);
              await clearMembershipSession();
              navigation.reset({
                index: 0,
                routes: [{name: 'JoinOrCreateClub'}],
              });
            } catch (err: any) {
              const code = err?.code as string | undefined;
              if (code === 'OWNER_TRANSFER_REQUIRED') {
                Alert.alert(
                  'Cannot Leave',
                  'You must transfer ownership before leaving this club.',
                );
              } else if (code === 'OWNER_PROMOTE_AND_TRANSFER_REQUIRED') {
                Alert.alert(
                  'Cannot Leave',
                  'Please promote another member to host first, then transfer ownership before leaving.',
                );
              } else {
                Alert.alert(
                  'Error',
                  err?.message ?? 'Could not leave club. Please try again.',
                );
              }
            }
          },
        },
      ],
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

          {isOwnerOrHost && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Join Code</Text>
              <View style={styles.joinCodeRow}>
                <Text style={[styles.infoValue, styles.joinCode]}>
                  {currentClub.joinCode}
                </Text>
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={() => {
                    Clipboard.setString(currentClub.joinCode ?? '');
                    showSnackbar('Join code copied');
                  }}>
                  <Text style={styles.copyBtnText}>Copy</Text>
                </TouchableOpacity>
              </View>
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

        {/* ===== HOST / OWNER ===== */}
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
          <View style={styles.recoveryCodeRow}>
            <Text style={styles.recoveryCode}>
              {currentMembership.recoveryCode || '—'}
            </Text>
            {!!currentMembership.recoveryCode && (
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={() => {
                  Clipboard.setString(currentMembership.recoveryCode ?? '');
                  showSnackbar('Recovery code copied');
                }}>
                <Text style={styles.copyBtnText}>Copy</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ===== LEAVE CLUB ===== */}
        <View style={[styles.card, styles.leaveCard]}>
          <TouchableOpacity
            style={styles.leaveButton}
            onPress={handleLeaveClub}>
            <Text style={styles.leaveButtonText}>Leave Club</Text>
          </TouchableOpacity>
          {role === 'owner' && (
            <Text style={styles.leaveOwnerNote}>
              Owners must transfer ownership before leaving.
            </Text>
          )}
        </View>
      </ScrollView>
      {snackVisible && (
        <View pointerEvents="none" style={styles.snackbar}>
          <Text style={styles.snackbarText}>{snackMsg}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: c.background},
    scroll: {padding: 20, paddingBottom: 40},
    snackbar: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
      zIndex: 999,
      elevation: 10,
      backgroundColor: '#1C1C1E',
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 18,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.25,
      shadowRadius: 8,
    },
    snackbarText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },

    summaryCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
    },
    userName: {
      fontSize: 22,
      fontWeight: 'bold',
      color: c.text,
    },
    userSub: {
      fontSize: 14,
      color: c.textMuted,
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
      color: c.textMuted,
    },
    summaryValue: {
      fontSize: 18,
      fontWeight: '700',
      marginTop: 4,
      color: c.text,
    },

    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 18,
      marginBottom: 16,
    },
    cardTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      marginBottom: 10,
      textTransform: 'uppercase',
    },

    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    infoLabel: {fontSize: 14, color: c.textMuted},
    infoValue: {fontSize: 14, fontWeight: '600', color: c.text},
    joinCode: {color: c.primary},
    joinCodeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    copyBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: c.surfaceRaised,
      borderRadius: 6,
    },
    copyBtnText: {fontSize: 12, fontWeight: '600', color: c.primary},

    actionItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 10,
      alignItems: 'center',
    },
    actionDivider: {
      height: 1,
      backgroundColor: c.border,
    },

    highlightAction: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },
    highlightTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
    },
    highlightDesc: {
      marginTop: 4,
      fontSize: 13,
      color: c.textMuted,
    },

    actionItemText: {
      fontSize: 15,
      color: c.text,
    },

    chevron: {
      fontSize: 22,
      color: c.textMuted,
    },

    dangerText: {
      color: c.danger,
    },

    metaText: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 4,
    },
    metaDesc: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 4,
      lineHeight: 18,
    },
    recoveryCodeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      gap: 12,
    },
    recoveryCode: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
      letterSpacing: 2,
      fontVariant: ['tabular-nums'],
    },
    leaveCard: {
      borderWidth: 1,
      borderColor: '#FFE2E2',
    },
    leaveButton: {
      paddingVertical: 13,
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: c.danger,
    },
    leaveButtonText: {
      color: c.danger,
      fontSize: 15,
      fontWeight: '700',
    },
    leaveOwnerNote: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: 8,
    },
  });
}
