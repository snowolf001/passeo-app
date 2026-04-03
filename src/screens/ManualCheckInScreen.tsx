import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useApp} from '../context/AppContext';
import {membershipService} from '../services/membershipService';
import {attendanceService} from '../services/attendanceService';
import {db} from '../data/mockData';
import {MembershipWithUser, DEFAULT_CLUB_SETTINGS} from '../types';
import {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ManualCheckIn'>;

type ListRow =
  | {
      type: 'summary';
      key: string;
    }
  | {
      type: 'banner';
      key: string;
      message: string;
    }
  | {
      type: 'section';
      key: string;
      title: string;
      subtitle?: string;
      collapsible?: boolean;
      collapsed?: boolean;
      onPress?: () => void;
    }
  | {
      type: 'member';
      key: string;
      member: MembershipWithUser;
    };

export default function ManualCheckInScreen({route, navigation}: Props) {
  const {sessionId} = route.params;
  const {currentMembership, currentClub, publishCheckInEvent} = useApp();

  const [members, setMembers] = useState<MembershipWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set());
  const [showCheckedInSection, setShowCheckedInSection] = useState(false);

  const [selectedMember, setSelectedMember] =
    useState<MembershipWithUser | null>(null);
  const [peopleCount, setPeopleCount] = useState(1);

  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine session backfill state (reads from in-memory db synchronously)
  const sessionRecord = useMemo(
    () => db.getSessions().find(s => s.id === sessionId) ?? null,
    [sessionId],
  );

  const sessionMode = useMemo((): 'live' | 'backfill' | 'expired' => {
    if (!sessionRecord) return 'live';
    const settings = currentClub?.settings ?? DEFAULT_CLUB_SETTINGS;
    if (!attendanceService.isSessionEnded(sessionRecord)) return 'live';
    if (attendanceService.canHostBackfill(sessionRecord, settings))
      return 'backfill';
    return 'expired';
  }, [sessionRecord, currentClub]);

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

  const closePeoplePicker = useCallback(() => {
    if (checkingInId) {
      return;
    }
    setSelectedMember(null);
    setPeopleCount(1);
  }, [checkingInId]);

  const loadMembers = useCallback(async () => {
    if (!currentMembership) {
      return;
    }

    setLoading(true);

    try {
      const [memberships, attendances] = await Promise.all([
        membershipService.getMembershipsByClub(currentMembership.clubId),
        attendanceService.getAttendancesForSession(sessionId),
      ]);

      const users = db.getUsers();

      const enriched: MembershipWithUser[] = memberships
        .filter(m => m.role === 'member' || m.role === 'host')
        .map(m => ({
          ...m,
          user: users.find(u => u.id === m.userId) ?? {
            id: m.userId,
            name: 'Unknown',
          },
        }));

      setMembers(enriched);
      setCheckedInIds(new Set(attendances.map(a => a.membershipId)));
    } finally {
      setLoading(false);
    }
  }, [currentMembership, sessionId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    return () => {
      if (snackTimer.current) {
        clearTimeout(snackTimer.current);
      }
    };
  }, []);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const base = q
      ? members.filter(m => m.user.name.toLowerCase().includes(q))
      : members;

    return base;
  }, [members, searchQuery]);

  const readyMembers = useMemo(
    () =>
      filteredMembers
        .filter(m => !checkedInIds.has(m.id) && m.credits > 0)
        .sort((a, b) => a.user.name.localeCompare(b.user.name)),
    [filteredMembers, checkedInIds],
  );

  const noCreditMembers = useMemo(
    () =>
      filteredMembers
        .filter(m => !checkedInIds.has(m.id) && m.credits <= 0)
        .sort((a, b) => a.user.name.localeCompare(b.user.name)),
    [filteredMembers, checkedInIds],
  );

  const checkedInMembers = useMemo(
    () =>
      filteredMembers
        .filter(m => checkedInIds.has(m.id))
        .sort((a, b) => a.user.name.localeCompare(b.user.name)),
    [filteredMembers, checkedInIds],
  );

  const totalMembers = filteredMembers.length;
  const totalReady = readyMembers.length;
  const totalNoCredits = noCreditMembers.length;
  const totalCheckedIn = checkedInMembers.length;

  const listData = useMemo((): ListRow[] => {
    const rows: ListRow[] = [{type: 'summary', key: 'summary'}];

    if (sessionMode === 'expired') {
      rows.push({
        type: 'banner',
        key: 'banner-expired',
        message: 'This session is no longer eligible for backfill check-in.',
      });
    }

    if (readyMembers.length > 0) {
      rows.push({
        type: 'section',
        key: 'section-ready',
        title:
          sessionMode === 'backfill'
            ? `Ready to Backfill (${readyMembers.length})`
            : `Ready to Check In (${readyMembers.length})`,
      });

      readyMembers.forEach(member => {
        rows.push({
          type: 'member',
          key: `member-${member.id}`,
          member,
        });
      });
    }

    if (noCreditMembers.length > 0) {
      rows.push({
        type: 'section',
        key: 'section-no-credits',
        title: `No Credits (${noCreditMembers.length})`,
        subtitle: 'These members cannot be checked in until they have credits.',
      });

      noCreditMembers.forEach(member => {
        rows.push({
          type: 'member',
          key: `member-${member.id}`,
          member,
        });
      });
    }

    if (checkedInMembers.length > 0) {
      rows.push({
        type: 'section',
        key: 'section-checked-in',
        title: `Already Checked In (${checkedInMembers.length})`,
        subtitle: showCheckedInSection ? 'Tap to hide' : 'Tap to show',
        collapsible: true,
        collapsed: !showCheckedInSection,
        onPress: () => setShowCheckedInSection(prev => !prev),
      });

      if (showCheckedInSection) {
        checkedInMembers.forEach(member => {
          rows.push({
            type: 'member',
            key: `member-${member.id}`,
            member,
          });
        });
      }
    }

    if (
      readyMembers.length === 0 &&
      noCreditMembers.length === 0 &&
      checkedInMembers.length === 0
    ) {
      rows.push({
        type: 'section',
        key: 'section-empty',
        title: 'No members found',
      });
    }

    return rows;
  }, [readyMembers, noCreditMembers, checkedInMembers, showCheckedInSection]);

  const handleOpenHistory = useCallback(
    (member: MembershipWithUser) => {
      navigation.navigate('AttendanceHistory', {
        membershipId: member.id,
        title: `${member.user.name} History`,
      });
    },
    [navigation],
  );

  const doCheckIn = async (target: MembershipWithUser, creditsUsed: number) => {
    if (!currentMembership || checkingInId) {
      return;
    }

    setCheckingInId(target.id);

    try {
      const result = await attendanceService.manualCheckIn({
        actingMembershipId: currentMembership.id,
        targetMembershipId: target.id,
        sessionId,
        creditsUsed,
      });

      if (result.success) {
        const checkedInAt = new Date().toISOString();

        setCheckedInIds(prev => {
          const next = new Set(prev);
          next.add(target.id);
          return next;
        });

        setMembers(prev =>
          prev.map(member =>
            member.id === target.id
              ? {...member, credits: Math.max(0, member.credits - creditsUsed)}
              : member,
          ),
        );

        publishCheckInEvent({
          membershipId: target.id,
          sessionId,
          checkedInAt,
        });

        const verb = sessionMode === 'backfill' ? 'backfilled' : 'checked in';
        showSnackbar(
          `${target.user.name} ${verb} · ${creditsUsed} credit${
            creditsUsed !== 1 ? 's' : ''
          } used`,
        );
      } else {
        Alert.alert('Failed', result.message);
      }
    } finally {
      setCheckingInId(null);
      closePeoplePicker();
    }
  };

  const handleCheckIn = (target: MembershipWithUser) => {
    if (!currentMembership || checkingInId) {
      return;
    }

    if (checkedInIds.has(target.id)) {
      return;
    }

    if (target.credits <= 0) {
      return;
    }

    setSelectedMember(target);
    setPeopleCount(1);
  };

  const renderSummaryCard = () => (
    <View style={styles.summaryCard}>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Members</Text>
        <Text style={styles.summaryValue}>{totalMembers}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Ready</Text>
        <Text style={styles.summaryValue}>{totalReady}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Checked In</Text>
        <Text style={styles.summaryValue}>{totalCheckedIn}</Text>
      </View>
    </View>
  );

  const renderSectionHeader = (
    title: string,
    subtitle?: string,
    collapsible?: boolean,
    collapsed?: boolean,
    onPress?: () => void,
  ) => {
    const content = (
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderTextWrap}>
          <Text style={styles.sectionHeaderTitle}>{title}</Text>
          {!!subtitle && (
            <Text style={styles.sectionHeaderSubtitle}>{subtitle}</Text>
          )}
        </View>
        {collapsible && (
          <Text style={styles.sectionHeaderChevron}>
            {collapsed ? '▾' : '▴'}
          </Text>
        )}
      </View>
    );

    if (collapsible && onPress) {
      return (
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={onPress}
          style={styles.sectionHeaderTouchable}>
          {content}
        </TouchableOpacity>
      );
    }

    return content;
  };

  const renderMemberCard = (item: MembershipWithUser) => {
    const isCheckedIn = checkedInIds.has(item.id);
    const hasNoCredits = item.credits <= 0;
    const isSessionExpired = sessionMode === 'expired';
    const isDisabled = isCheckedIn || hasNoCredits || isSessionExpired;
    const isProcessing = checkingInId === item.id;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.memberCard, isDisabled && styles.memberCardDisabled]}
        onPress={() => handleCheckIn(item)}
        disabled={isDisabled || !!checkingInId}>
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, isDisabled && styles.textMuted]}>
            {item.user.name}
          </Text>
          <Text style={styles.memberRole}>{item.role}</Text>
        </View>

        <View style={styles.memberRight}>
          <Text style={[styles.creditText, hasNoCredits && styles.creditEmpty]}>
            {item.credits} credit{item.credits !== 1 ? 's' : ''}
          </Text>

          {isProcessing && <ActivityIndicator size="small" color="#007AFF" />}

          {!isProcessing && isCheckedIn && (
            <View style={styles.badgeSuccess}>
              <Text style={styles.badgeText}>Checked In</Text>
            </View>
          )}

          {!isProcessing && !isCheckedIn && hasNoCredits && (
            <View style={styles.badgeError}>
              <Text style={styles.badgeText}>No Credits</Text>
            </View>
          )}

          {!isProcessing &&
            !isCheckedIn &&
            !hasNoCredits &&
            !isSessionExpired && (
              <View style={styles.badgeAction}>
                <Text style={styles.badgeActionText}>
                  {sessionMode === 'backfill'
                    ? 'Tap to Backfill'
                    : 'Tap to Check In'}
                </Text>
              </View>
            )}

          <TouchableOpacity
            style={styles.historyButton}
            onPress={e => {
              e.stopPropagation?.();
              handleOpenHistory(item);
            }}
            disabled={!!checkingInId}>
            <Text style={styles.historyButtonText}>History</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderItem = ({item}: {item: ListRow}) => {
    if (item.type === 'summary') {
      return renderSummaryCard();
    }

    if (item.type === 'section') {
      return renderSectionHeader(
        item.title,
        item.subtitle,
        item.collapsible,
        item.collapsed,
        item.onPress,
      );
    }

    if (item.type === 'banner') {
      return (
        <View style={styles.bannerCard}>
          <Text style={styles.bannerText}>{item.message}</Text>
        </View>
      );
    }

    return renderMemberCard(item.member);
  };

  const maxPeople = selectedMember?.credits ?? 1;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.screenRoot}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search member name"
            placeholderTextColor="#AEAEB2"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            clearButtonMode="always"
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{marginTop: 40}} color="#007AFF" />
        ) : (
          <FlatList
            data={listData}
            keyExtractor={item => item.key}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {snackVisible && (
          <View pointerEvents="none" style={styles.snackbar}>
            <Text style={styles.snackbarText}>{snackMsg}</Text>
          </View>
        )}

        <Modal
          visible={!!selectedMember}
          transparent
          animationType="fade"
          onRequestClose={closePeoplePicker}>
          <View style={styles.modalOverlay}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={closePeoplePicker}
            />
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>How many people?</Text>

              {!!selectedMember && (
                <Text style={styles.modalSubtitle}>
                  {selectedMember.user.name} has {selectedMember.credits} credit
                  {selectedMember.credits !== 1 ? 's' : ''} available
                </Text>
              )}

              <View style={styles.counterRow}>
                <TouchableOpacity
                  style={[
                    styles.counterButton,
                    peopleCount <= 1 && styles.counterButtonDisabled,
                  ]}
                  onPress={() => setPeopleCount(prev => Math.max(1, prev - 1))}
                  disabled={peopleCount <= 1}>
                  <Text
                    style={[
                      styles.counterButtonText,
                      peopleCount <= 1 && styles.counterButtonTextDisabled,
                    ]}>
                    −
                  </Text>
                </TouchableOpacity>

                <View style={styles.counterValueWrap}>
                  <Text style={styles.counterValue}>{peopleCount}</Text>
                  <Text style={styles.counterValueLabel}>
                    {peopleCount === 1 ? 'person' : 'people'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.counterButton,
                    peopleCount >= maxPeople && styles.counterButtonDisabled,
                  ]}
                  onPress={() =>
                    setPeopleCount(prev => Math.min(maxPeople, prev + 1))
                  }
                  disabled={peopleCount >= maxPeople}>
                  <Text
                    style={[
                      styles.counterButtonText,
                      peopleCount >= maxPeople &&
                        styles.counterButtonTextDisabled,
                    ]}>
                    +
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalSecondaryButton}
                  onPress={closePeoplePicker}>
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalPrimaryButton,
                    !!checkingInId && styles.modalPrimaryButtonDisabled,
                  ]}
                  onPress={() =>
                    selectedMember && doCheckIn(selectedMember, peopleCount)
                  }
                  disabled={!!checkingInId}>
                  {!!checkingInId ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>
                      {sessionMode === 'backfill' ? 'Backfill' : 'Check In'} (
                      {peopleCount} {peopleCount === 1 ? 'person' : 'people'})
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  screenRoot: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F5F5F7',
  },
  searchBar: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  searchInput: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 16,
    color: '#1C1C1E',
  },
  listContent: {
    padding: 16,
    paddingBottom: 90,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 10,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 6,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 22,
    color: '#1C1C1E',
    fontWeight: '700',
  },
  sectionHeaderTouchable: {
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionHeaderTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  sectionHeaderSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: '#8E8E93',
  },
  sectionHeaderChevron: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '700',
  },
  memberCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  memberCardDisabled: {
    backgroundColor: '#F2F2F7',
    shadowOpacity: 0,
    elevation: 0,
  },
  memberInfo: {flex: 1},
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 3,
  },
  memberRole: {
    fontSize: 12,
    color: '#8E8E93',
    textTransform: 'uppercase',
  },
  textMuted: {color: '#8E8E93'},
  memberRight: {
    alignItems: 'flex-end',
    gap: 6,
    marginLeft: 12,
  },
  creditText: {
    fontSize: 13,
    color: '#3A3A3C',
  },
  creditEmpty: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  badgeSuccess: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeError: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeAction: {
    backgroundColor: '#EAF3FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeActionText: {
    color: '#007AFF',
    fontSize: 11,
    fontWeight: '700',
  },
  historyButton: {
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
  },
  historyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#007AFF',
  },
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 22,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  counterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterButtonDisabled: {
    backgroundColor: '#E5E5EA',
  },
  counterButtonText: {
    fontSize: 28,
    fontWeight: '500',
    color: '#1C1C1E',
    lineHeight: 30,
  },
  counterButtonTextDisabled: {
    color: '#AEAEB2',
  },
  counterValueWrap: {
    minWidth: 110,
    alignItems: 'center',
    marginHorizontal: 24,
  },
  counterValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  counterValueLabel: {
    marginTop: 4,
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3C',
  },
  modalPrimaryButton: {
    flex: 1.5,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  modalPrimaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalPrimaryButtonDisabled: {
    opacity: 0.7,
  },
  bannerCard: {
    backgroundColor: '#FFF3CD',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#FF3B30',
  },
  bannerText: {
    fontSize: 13,
    color: '#1C1C1E',
    lineHeight: 18,
  },
});
