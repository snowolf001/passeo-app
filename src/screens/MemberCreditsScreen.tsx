import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Clipboard,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../context/AppContext';
import {getClubMembers, ApiClubMember} from '../services/api/clubApi';
import {
  adjustMemberCredits,
  getMembershipById,
  updateMemberRole,
} from '../services/api/membershipApi';

type Props = {navigation: any};
type NavProp = NativeStackNavigationProp<RootStackParamList, 'MemberCredits'>;

export default function MemberCreditsScreen({navigation}: Props) {
  const {currentMembership} = useApp();
  const nav = useNavigation<NavProp>();
  const [members, setMembers] = useState<ApiClubMember[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [selected, setSelected] = useState<ApiClubMember | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingRole, setChangingRole] = useState(false);

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

  const loadMembers = useCallback(async () => {
    if (!currentMembership) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getClubMembers(currentMembership.clubId);
      setMembers(
        data
          .filter(m => m.active)
          .sort((a, b) => a.userName.localeCompare(b.userName)),
      );
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [currentMembership]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const openModal = async (member: ApiClubMember) => {
    setSelected(member);
    setAmount('');
    setReason('');
    setRecoveryCode(null);
    setLoadingCode(true);
    try {
      const result = await getMembershipById(member.membershipId);
      setRecoveryCode(result.membership.recoveryCode);
    } catch {
      setRecoveryCode(null);
    } finally {
      setLoadingCode(false);
    }
  };

  const closeModal = () => {
    setSelected(null);
    setRecoveryCode(null);
    setAmount('');
    setReason('');
  };

  const handleRoleChange = (newRole: 'member' | 'host') => {
    if (!selected) return;
    const label = newRole === 'host' ? 'Make Host' : 'Make Member';
    Alert.alert(label, `Change ${selected.userName}'s role to ${newRole}?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Confirm',
        style: 'default',
        onPress: async () => {
          setChangingRole(true);
          try {
            await updateMemberRole(selected.membershipId, newRole);
            setMembers(prev =>
              prev.map(m =>
                m.membershipId === selected.membershipId
                  ? {...m, role: newRole}
                  : m,
              ),
            );
            setSelected(prev => (prev ? {...prev, role: newRole} : prev));
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Failed to change role.');
          } finally {
            setChangingRole(false);
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!selected) return;

    const parsed = parseInt(amount, 10);
    if (!amount || isNaN(parsed) || parsed === 0) {
      Alert.alert('Invalid amount', 'Enter a non-zero number of credits.');
      return;
    }
    setSaving(true);
    try {
      const finalReason = reason.trim() || 'Manual adjustment';
      await adjustMemberCredits(selected.membershipId, parsed, finalReason);
      // Update local list optimistically
      setMembers(prev =>
        prev.map(m =>
          m.membershipId === selected.membershipId
            ? {...m, credits: m.credits + parsed}
            : m,
        ),
      );
      closeModal();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to adjust credits.');
    } finally {
      setSaving(false);
    }
  };

  const renderMember = ({item}: {item: ApiClubMember}) => {
    const isSelf = item.membershipId === currentMembership?.id;
    return (
      <TouchableOpacity
        style={[styles.row, isSelf && styles.rowSelf]}
        onPress={() => !isSelf && openModal(item)}
        activeOpacity={isSelf ? 1 : 0.7}>
        <View style={styles.rowLeft}>
          <View style={styles.nameRow}>
            <Text style={styles.memberName}>{item.userName}</Text>
            {isSelf && <Text style={styles.youBadge}>You</Text>}
          </View>
          <Text style={styles.memberRole}>{item.role}</Text>
        </View>
        <View style={styles.creditsChip}>
          <Text style={styles.creditsNum}>{item.credits}</Text>
          <Text style={styles.creditsLabel}>credits</Text>
        </View>
        {!isSelf && <Text style={styles.chevron}>›</Text>}
        {isSelf && <View style={styles.chevronPlaceholder} />}
      </TouchableOpacity>
    );
  };

  if (!currentMembership) return null;

  const filteredMembers = search.trim()
    ? members.filter(m =>
        m.userName.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : members;

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.searchWrapper}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search members…"
          placeholderTextColor="#AEAEB2"
          clearButtonMode="while-editing"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {loading ? (
        <ActivityIndicator style={{marginTop: 60}} color="#007AFF" />
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadMembers}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredMembers}
          keyExtractor={m => m.membershipId}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {search.trim()
                ? 'No members match your search.'
                : 'No active members found.'}
            </Text>
          }
        />
      )}

      {/* Member Details Modal */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            {/* ── Section 1: Member overview ─────────────────────────── */}
            <View style={styles.overviewSection}>
              <Text style={styles.overviewName}>
                {selected?.userName ?? ''}
              </Text>
              <Text style={styles.overviewCredits}>
                {selected?.credits ?? 0} credits
              </Text>
              {selected && (
                <TouchableOpacity
                  style={styles.historyLink}
                  onPress={() => {
                    closeModal();
                    nav.navigate('MemberCreditHistory', {
                      membershipId: selected.membershipId,
                      memberName: selected.userName,
                    });
                  }}>
                  <Text style={styles.historyLinkText}>
                    View credit history →
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.sectionDivider} />

            {/* ── Section 2: Recovery code ───────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Recovery Code</Text>
              <View style={styles.codeRow}>
                {loadingCode ? (
                  <ActivityIndicator size="small" color="#8E8E93" />
                ) : (
                  <>
                    <Text style={styles.codeText}>{recoveryCode ?? '—'}</Text>
                    {recoveryCode && (
                      <TouchableOpacity
                        style={styles.copyBtn}
                        onPress={() => {
                          Clipboard.setString(recoveryCode);
                          showSnackbar('Recovery code copied to clipboard.');
                        }}>
                        <Text style={styles.copyBtnText}>Copy</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </View>

            {/* Role Management — admin/owner only */}
            {selected &&
              selected.role !== 'owner' &&
              (currentMembership?.role === 'admin' ||
                currentMembership?.role === 'owner') && (
                <>
                  <View style={styles.sectionDivider} />
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Role</Text>
                    <View style={styles.roleRow}>
                      <TouchableOpacity
                        style={[
                          styles.roleBtn,
                          selected.role === 'member' && styles.roleBtnActive,
                        ]}
                        onPress={() =>
                          selected.role !== 'member' &&
                          handleRoleChange('member')
                        }
                        disabled={changingRole || selected.role === 'member'}>
                        <Text
                          style={[
                            styles.roleBtnText,
                            selected.role === 'member' &&
                              styles.roleBtnTextActive,
                          ]}>
                          Member
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.roleBtn,
                          selected.role === 'host' && styles.roleBtnActive,
                        ]}
                        onPress={() =>
                          selected.role !== 'host' && handleRoleChange('host')
                        }
                        disabled={changingRole || selected.role === 'host'}>
                        <Text
                          style={[
                            styles.roleBtnText,
                            selected.role === 'host' &&
                              styles.roleBtnTextActive,
                          ]}>
                          Host
                        </Text>
                      </TouchableOpacity>
                      {changingRole && (
                        <ActivityIndicator
                          size="small"
                          color="#8E8E93"
                          style={{marginLeft: 8}}
                        />
                      )}
                    </View>
                  </View>
                </>
              )}

            <View style={styles.sectionDivider} />

            {/* ── Section 3: Adjust credits ──────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Adjust Credits</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="Enter amount (e.g. +5 or -2)"
                placeholderTextColor="#C7C7CC"
                returnKeyType="next"
              />
              <Text style={styles.fieldHint}>
                + to add credits, - to remove credits
              </Text>
              <Text style={[styles.sectionLabel, {marginTop: 14}]}>
                Reason <Text style={styles.fieldOptional}>(optional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder="Default: Manual adjustment"
                placeholderTextColor="#C7C7CC"
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
            </View>

            {/* ── Action buttons ─────────────────────────────────────── */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={closeModal}
                disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {snackVisible && (
        <View pointerEvents="none" style={styles.snackbar}>
          <Text style={styles.snackbarText}>{snackMsg}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  searchWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F5F5F7',
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  list: {padding: 16, paddingBottom: 40},
  separator: {height: 1, backgroundColor: '#F2F2F7', marginHorizontal: 4},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  rowLeft: {flex: 1},
  rowSelf: {opacity: 0.55},
  nameRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  youBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
    backgroundColor: '#E5E5EA',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    textTransform: 'uppercase',
  },
  chevronPlaceholder: {width: 12},
  memberName: {fontSize: 15, fontWeight: '600', color: '#1C1C1E'},
  memberRole: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  creditsChip: {
    alignItems: 'center',
    marginRight: 10,
    minWidth: 48,
  },
  creditsNum: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007AFF',
    lineHeight: 24,
  },
  creditsLabel: {fontSize: 10, color: '#8E8E93', textTransform: 'uppercase'},
  chevron: {fontSize: 20, color: '#C7C7CC'},
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryBtnText: {color: '#FFF', fontWeight: '600', fontSize: 14},
  emptyText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 40,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E5EA',
    alignSelf: 'center',
    marginBottom: 20,
  },
  // Section 1: Member overview
  overviewSection: {
    marginBottom: 4,
  },
  overviewName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  overviewCredits: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  historyLink: {
    alignSelf: 'flex-end',
  },
  historyLinkText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  // Section divider
  sectionDivider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginVertical: 16,
  },
  // Generic section wrapper
  section: {},
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  fieldHint: {fontSize: 11, color: '#AEAEB2', marginTop: 5},
  fieldOptional: {
    fontSize: 11,
    fontWeight: '400',
    color: '#AEAEB2',
    textTransform: 'none',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  codeText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    letterSpacing: 0.5,
  },
  copyBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  copyBtnText: {color: '#FFF', fontSize: 13, fontWeight: '600'},
  roleRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  roleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  roleBtnActive: {
    backgroundColor: '#EBF4FF',
    borderColor: '#007AFF',
  },
  roleBtnText: {fontSize: 14, fontWeight: '600', color: '#3A3A3C'},
  roleBtnTextActive: {color: '#007AFF'},
  input: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C1C1E',
  },
  modalActions: {flexDirection: 'row', gap: 10, marginTop: 24},
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
  },
  cancelBtnText: {fontSize: 15, fontWeight: '600', color: '#3A3A3C'},
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  saveBtnDisabled: {backgroundColor: '#A3C8FF'},
  saveBtnText: {fontSize: 15, fontWeight: '700', color: '#FFFFFF'},
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
    flexShrink: 1,
  },
});
