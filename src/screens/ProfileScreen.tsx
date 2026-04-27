import React, {useCallback, useEffect, useMemo, useRef, useState, Component} from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../context/AppContext';
import {leaveClub, getClubMembers, transferOwnership, ApiClubMember} from '../services/api/clubApi';
import {useAppTheme} from '../theme/useAppTheme';
import {useClubSubscription} from '../hooks/useClubSubscription';
import {
  canAccessSummaryReports,
  canAccessAuditLogs,
} from '../config/entitlementConfig';
import type {ThemeColors} from '../theme/colors';

type Props = {navigation: any};

// ── Crash Diagnostic ErrorBoundary ───────────────────────────────────────────
// Wraps the entire screen so that ANY JavaScript render error that would
// normally silently kill the app in Release mode is caught here instead, and
// an Alert is shown with the exact error message.
class ScreenErrorBoundary extends Component<
  {children: React.ReactNode},
  {crashed: boolean; errorMsg: string}
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {crashed: false, errorMsg: ''};
  }

  static getDerivedStateFromError(error: any) {
    return {crashed: true, errorMsg: error?.message ?? String(error)};
  }

  componentDidCatch(error: any, info: any) {
    const msg = error?.message ?? String(error);
    const stack = (info?.componentStack ?? '').slice(0, 400);

    Alert.alert('[DEBUG] ProfileScreen Crash', msg + '\n\n' + stack, [
      {text: 'OK'},
    ]);
  }

  render() {
    if (this.state.crashed) {
      return (
        <View style={stylesErrorBoundary.container}>
          <Text style={stylesErrorBoundary.text}>{this.state.errorMsg}</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

export default function ProfileScreen({navigation}: Props) {
  const {currentMembership, currentClub, clearMembershipSession, refresh: refreshApp} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {status: subStatus, refresh} = useClubSubscription(currentClub?.id);
  const isPro = subStatus?.isPro ?? false;

  // ── Transfer Ownership state ──────────────────────────────────────────────
  const [transferVisible, setTransferVisible] = useState(false);
  const [transferMembers, setTransferMembers] = useState<ApiClubMember[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSelected, setTransferSelected] = useState<ApiClubMember | null>(null);
  const [transferConfirming, setTransferConfirming] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

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

  useFocusEffect(
    React.useCallback(() => {
      refresh();
    }, [refresh]),
  );

  if (!currentMembership || !currentClub) {
    return null;
  }

  const role = currentMembership.role;
  const isOwnerOrHost = ['host', 'owner'].includes(role);
  const canManageClub = ['host', 'owner'].includes(role);

  const ROLE_LABELS: Record<string, string> = {
    member: 'Member',
    host: 'Host',
    owner: 'Owner',
  };

  const handleTransferOwnership = async () => {
    if (!currentClub) return;
    setTransferError(null);
    setTransferSelected(null);
    setTransferVisible(true);
    setTransferLoading(true);
    try {
      const members = await getClubMembers(currentClub.id);
      // Eligible: active, not the current owner
      const eligible = members.filter(
        m => m.active && m.membershipId !== currentMembership.id && m.role !== 'owner',
      );
      setTransferMembers(eligible);
    } catch {
      setTransferError('Could not load members. Please try again.');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleTransferConfirm = async () => {
    if (!transferSelected || !currentClub) return;
    setTransferConfirming(true);
    setTransferError(null);
    try {
      await transferOwnership(currentClub.id, transferSelected.membershipId);
      setTransferVisible(false);
      setTransferSelected(null);
      // Refresh app context so this user's role updates to host
      await refreshApp();
      showSnackbar('Ownership transferred successfully');
    } catch (err: any) {
      const code = err?.code as string | undefined;
      const messages: Record<string, string> = {
        NOT_OWNER: 'Only the club owner can transfer ownership.',
        TARGET_NOT_FOUND: 'Selected member was not found in this club.',
        TARGET_NOT_ACTIVE: 'Selected member is no longer active.',
        TARGET_NOT_IN_CLUB: 'Selected member does not belong to this club.',
        INVALID_TARGET: 'Invalid transfer target.',
      };
      setTransferError(messages[code ?? ''] ?? (err?.message ?? 'Transfer failed. Please try again.'));
    } finally {
      setTransferConfirming(false);
    }
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
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}>
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

          {/* ===== BACKFILL ===== */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Backfill</Text>

            <TouchableOpacity
              style={styles.highlightAction}
              onPress={handleOpenBackfill}>
              <View style={styles.highlightTextWrap}>
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
                onPress={() => navigation.navigate('ClubPro')}>
                <View style={styles.proRowInner}>
                  <Text style={styles.actionItemText}>Club Pro</Text>
                  {isPro && (
                    <View style={styles.proActiveBadge}>
                      <Text style={styles.proActiveBadgeText}>PRO</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>

              <View style={styles.actionDivider} />

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() =>
                  canAccessSummaryReports(isPro)
                    ? navigation.navigate('Reports')
                    : navigation.navigate('ClubPro')
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
                  canAccessAuditLogs(isPro)
                    ? navigation.navigate('AuditLog')
                    : navigation.navigate('ClubPro')
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

          {/* ===== DEV ONLY: Subscription Debug ===== */}
          {__DEV__ && (
            <View style={[styles.card, styles.devCard]}>
              <Text style={styles.devCardTitle}>
                Subscription Debug (DEV ONLY)
              </Text>
              <Text style={styles.devStatus}>
                billingState: {subStatus?.billingState ?? 'unknown'}{' '}
                {isPro ? '✓ Pro' : '✗ Free'}
              </Text>
            </View>
          )}
        </ScrollView>
        {snackVisible && (
          <View pointerEvents="none" style={styles.snackbar}>
            <Text style={styles.snackbarText}>{snackMsg}</Text>
          </View>
        )}

        {/* ===== TRANSFER OWNERSHIP MODAL ===== */}
        <Modal
          visible={transferVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            if (!transferConfirming) setTransferVisible(false);
          }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />

              {/* Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Transfer Ownership</Text>
                {!transferConfirming && (
                  <TouchableOpacity
                    onPress={() => {
                      setTransferVisible(false);
                      setTransferSelected(null);
                      setTransferError(null);
                    }}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Text style={styles.modalCloseText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>

              {transferError && (
                <Text style={styles.modalError}>{transferError}</Text>
              )}

              {!transferSelected ? (
                // Step 1: member selection
                <>
                  <Text style={styles.modalSubtitle}>
                    Select a member or host to become the new owner.
                  </Text>
                  {transferLoading ? (
                    <ActivityIndicator
                      size="large"
                      color={colors.primary}
                      style={{marginVertical: 32}}
                    />
                  ) : transferMembers.length === 0 ? (
                    <Text style={styles.modalEmpty}>
                      No eligible members found. A club must have at least one
                      other active member or host to transfer ownership.
                    </Text>
                  ) : (
                    <FlatList
                      data={transferMembers}
                      keyExtractor={m => m.membershipId}
                      style={styles.modalList}
                      renderItem={({item}) => (
                        <TouchableOpacity
                          style={styles.modalMemberRow}
                          onPress={() => setTransferSelected(item)}>
                          <View>
                            <Text style={styles.modalMemberName}>
                              {item.userName}
                            </Text>
                            <Text style={styles.modalMemberRole}>
                              {item.role.charAt(0).toUpperCase() +
                                item.role.slice(1)}
                            </Text>
                          </View>
                          <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>
                      )}
                    />
                  )}
                </>
              ) : (
                // Step 2: confirmation
                <>
                  <Text style={styles.modalSubtitle}>
                    Transfer ownership to{' '}
                    <Text style={styles.modalBold}>{transferSelected.userName}</Text>
                    ?
                  </Text>
                  <Text style={styles.modalConfirmNote}>
                    • You will become a host.{'\n'}
                    • {transferSelected.userName} will become the club owner.{'\n'}
                    • Club Pro subscription will remain active for this club.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.modalConfirmBtn,
                      transferConfirming && styles.modalConfirmBtnDisabled,
                    ]}
                    disabled={transferConfirming}
                    onPress={handleTransferConfirm}>
                    {transferConfirming ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.modalConfirmBtnText}>
                        Confirm Transfer
                      </Text>
                    )}
                  </TouchableOpacity>
                  {!transferConfirming && (
                    <TouchableOpacity
                      style={styles.modalBackBtn}
                      onPress={() => {
                        setTransferSelected(null);
                        setTransferError(null);
                      }}>
                      <Text style={styles.modalBackBtnText}>← Back</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ScreenErrorBoundary>
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
    highlightTextWrap: {
      flex: 1,
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
    proRowInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    proActiveBadge: {
      backgroundColor: c.primary,
      borderRadius: 5,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    proActiveBadgeText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.4,
    },

    chevron: {
      fontSize: 22,
      color: c.textMuted,
    },

    dangerText: {
      color: c.danger,
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

    devCard: {
      borderWidth: 1,
      borderColor: '#FFA500',
      borderStyle: 'dashed',
    },
    devCardTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFA500',
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    devStatus: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
    },

    // \u2500\u2500 Transfer Ownership Modal \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingBottom: 40,
      maxHeight: '80%',
    },
    modalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 16,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
    },
    modalCloseText: {
      fontSize: 15,
      color: c.primary,
    },
    modalSubtitle: {
      fontSize: 14,
      color: c.textMuted,
      marginBottom: 16,
      lineHeight: 20,
    },
    modalBold: {
      fontWeight: '700',
      color: c.text,
    },
    modalEmpty: {
      fontSize: 14,
      color: c.textMuted,
      textAlign: 'center',
      marginVertical: 24,
      lineHeight: 20,
    },
    modalError: {
      fontSize: 13,
      color: c.danger,
      marginBottom: 12,
      backgroundColor: '#FFF0F0',
      padding: 10,
      borderRadius: 8,
    },
    modalList: {
      maxHeight: 300,
    },
    modalMemberRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalMemberName: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
    modalMemberRole: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 2,
    },
    modalConfirmNote: {
      fontSize: 14,
      color: c.textMuted,
      lineHeight: 22,
      marginBottom: 24,
    },
    modalConfirmBtn: {
      backgroundColor: c.danger,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 12,
    },
    modalConfirmBtnDisabled: {
      opacity: 0.6,
    },
    modalConfirmBtnText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
    modalBackBtn: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    modalBackBtnText: {
      fontSize: 14,
      color: c.primary,
    },
  });
}

const stylesErrorBoundary = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: 'red',
    padding: 20,
  },
});
