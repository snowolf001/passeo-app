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
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useApp} from '../context/AppContext';
import {getClubMembers, ApiClubMember} from '../services/api/clubApi';
import {
  getSessionById,
  getCheckedInMembers,
  manualCheckIn,
} from '../services/api/sessionApi';
import {DEFAULT_CLUB_SETTINGS} from '../types';
import {RootStackParamList} from '../navigation/types';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';
import {trackEvent} from '../analytics/trackEvent';

function isSessionEnded(endTime: string | null | undefined): boolean {
  if (!endTime) return false;
  const endMs = new Date(endTime).getTime();
  if (Number.isNaN(endMs)) return false;
  return endMs < Date.now();
}

function hoursSinceEnd(endTime: string): number {
  const endMs = new Date(endTime).getTime();
  return Math.max(0, (Date.now() - endMs) / (1000 * 60 * 60));
}

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
      member: ApiClubMember;
    };

export default function ManualCheckInScreen({route, navigation}: Props) {
  const {sessionId} = route.params;
  const {currentMembership, currentClub, publishCheckInEvent} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [members, setMembers] = useState<ApiClubMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set());
  const [showCheckedInSection, setShowCheckedInSection] = useState(false);
  const [sessionEndTime, setSessionEndTime] = useState<string | null>(null);
  const [sessionCapacity, setSessionCapacity] = useState<number | null>(null);

  const [selectedMember, setSelectedMember] = useState<ApiClubMember | null>(
    null,
  );
  const [peopleCount, setPeopleCount] = useState(1);

  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionMode = useMemo((): 'live' | 'backfill' | 'expired' => {
    if (!sessionEndTime || !isSessionEnded(sessionEndTime)) return 'live';
    const settings = currentClub?.settings ?? DEFAULT_CLUB_SETTINGS;
    const hours = hoursSinceEnd(sessionEndTime);
    const hostWindow =
      typeof settings?.hostBackfillHours === 'number'
        ? settings.hostBackfillHours
        : DEFAULT_CLUB_SETTINGS.hostBackfillHours;
    return hours <= hostWindow ? 'backfill' : 'expired';
  }, [sessionEndTime, currentClub]);

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
      const [apiMembers, checkedIn, session] = await Promise.all([
        getClubMembers(currentMembership.clubId),
        getCheckedInMembers(sessionId),
        getSessionById(sessionId),
      ]);

      setMembers(apiMembers);
      setCheckedInIds(new Set(checkedIn.map(a => a.membershipId)));
      setSessionEndTime(session.endTime ?? null);
      setSessionCapacity(session.capacity ?? null);
    } catch (err) {
      console.warn('[ManualCheckIn] loadMembers error:', err);
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
    return q
      ? members.filter(m => m.userName.toLowerCase().includes(q))
      : members;
  }, [members, searchQuery]);

  const readyMembers = useMemo(
    () =>
      filteredMembers
        .filter(m => !checkedInIds.has(m.membershipId) && m.credits > 0)
        .sort((a, b) => a.userName.localeCompare(b.userName)),
    [filteredMembers, checkedInIds],
  );

  const noCreditMembers = useMemo(
    () =>
      filteredMembers
        .filter(m => !checkedInIds.has(m.membershipId) && m.credits <= 0)
        .sort((a, b) => a.userName.localeCompare(b.userName)),
    [filteredMembers, checkedInIds],
  );

  const checkedInMembers = useMemo(
    () =>
      filteredMembers
        .filter(m => checkedInIds.has(m.membershipId))
        .sort((a, b) => a.userName.localeCompare(b.userName)),
    [filteredMembers, checkedInIds],
  );

  const totalMembers = filteredMembers.length;
  const totalReady = readyMembers.length;
  const totalNoCredits = noCreditMembers.length;
  const totalCheckedIn = checkedInMembers.length;

  const isSessionFull =
    sessionCapacity !== null && checkedInIds.size >= sessionCapacity;

  const listData = useMemo((): ListRow[] => {
    const rows: ListRow[] = [{type: 'summary', key: 'summary'}];

    if (sessionMode === 'expired') {
      rows.push({
        type: 'banner',
        key: 'banner-expired',
        message: 'This session is no longer eligible for backfill check-in.',
      });
    }

    if (isSessionFull) {
      rows.push({
        type: 'banner',
        key: 'banner-full',
        message: 'This session is full. No more check-ins are allowed.',
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
          key: `member-${member.membershipId}`,
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
          key: `member-${member.membershipId}`,
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
            key: `member-${member.membershipId}`,
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
  }, [
    readyMembers,
    noCreditMembers,
    checkedInMembers,
    showCheckedInSection,
    isSessionFull,
    sessionMode,
  ]);

  const handleOpenHistory = useCallback(
    (member: ApiClubMember) => {
      navigation.navigate('AttendanceHistory', {
        membershipId: member.membershipId,
        title: `${member.userName} History`,
      });
    },
    [navigation],
  );

  const doCheckIn = async (target: ApiClubMember, creditsUsed: number) => {
    if (!currentMembership || checkingInId) {
      return;
    }

    setCheckingInId(target.membershipId);

    try {
      const result = await manualCheckIn(
        sessionId,
        target.membershipId,
        creditsUsed,
      );

      const checkedInAt = result.checkedInAt;

      setCheckedInIds(prev => {
        const next = new Set(prev);
        next.add(target.membershipId);
        return next;
      });

      setMembers(prev =>
        prev.map(member =>
          member.membershipId === target.membershipId
            ? {...member, credits: result.creditsRemaining}
            : member,
        ),
      );

      publishCheckInEvent({
        membershipId: target.membershipId,
        sessionId,
        checkedInAt,
      });

      const verb = sessionMode === 'backfill' ? 'backfilled' : 'checked in';
      showSnackbar(
        `${target.userName} ${verb} · ${creditsUsed} credit${
          creditsUsed !== 1 ? 's' : ''
        } used`,
      );

      trackEvent({
        eventName: 'manual_checkin_success',
        sourceScreen: 'ManualCheckIn',
        clubId: currentMembership.clubId,
        sessionId: sessionId,
      });
    } catch (err: any) {
      const code = err?.code as string | undefined;
      const message =
        code === 'SESSION_FULL'
          ? 'This session is full.'
          : code === 'ALREADY_CHECKED_IN'
          ? 'This member is already checked in.'
          : err?.message || 'Check-in failed. Please try again.';
      Alert.alert('Failed', message);

      trackEvent({
        eventName: 'manual_checkin_failed',
        sourceScreen: 'ManualCheckIn',
        clubId: currentMembership.clubId,
        sessionId: sessionId,
        errorCode: code || 'UNKNOWN_ERROR',
      });
    } finally {
      setCheckingInId(null);
      closePeoplePicker();
    }
  };

  const handleCheckIn = (target: ApiClubMember) => {
    if (!currentMembership || checkingInId) {
      return;
    }

    if (checkedInIds.has(target.membershipId)) {
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

  const renderMemberCard = (item: ApiClubMember) => {
    const isCheckedIn = checkedInIds.has(item.membershipId);
    const hasNoCredits = item.credits <= 0;
    const isSessionExpired = sessionMode === 'expired';
    const isFullBlock = isSessionFull && !isCheckedIn;
    const isDisabled =
      isCheckedIn || hasNoCredits || isSessionExpired || isFullBlock;
    const isProcessing = checkingInId === item.membershipId;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.memberCard, isDisabled && styles.memberCardDisabled]}
        onPress={() => handleCheckIn(item)}
        disabled={isDisabled || !!checkingInId}>
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, isDisabled && styles.textMuted]}>
            {item.userName}
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

          {!isProcessing && !isCheckedIn && isFullBlock && (
            <View style={styles.badgeError}>
              <Text style={styles.badgeText}>Session Full</Text>
            </View>
          )}

          {!isProcessing &&
            !isCheckedIn &&
            !hasNoCredits &&
            !isSessionExpired &&
            !isFullBlock && (
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
            onPress={() => {
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
                  {selectedMember.userName} has {selectedMember.credits} credit
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
                    <>
                      <Text style={styles.modalPrimaryButtonText}>
                        {sessionMode === 'backfill' ? 'Backfill' : 'Check In'}
                      </Text>
                      <Text style={styles.modalPrimaryButtonSub}>
                        {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
                      </Text>
                    </>
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

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.background,
    },
    screenRoot: {
      flex: 1,
      position: 'relative',
      backgroundColor: c.background,
    },
    searchBar: {
      padding: 16,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    searchInput: {
      backgroundColor: c.surfaceRaised,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 10,
      fontSize: 16,
      color: c.text,
    },
    listContent: {
      padding: 16,
      paddingBottom: 90,
    },
    summaryCard: {
      flexDirection: 'row',
      backgroundColor: c.card,
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
      backgroundColor: c.border,
      marginVertical: 4,
    },
    summaryLabel: {
      fontSize: 12,
      color: c.textMuted,
      marginBottom: 6,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    summaryValue: {
      fontSize: 22,
      color: c.text,
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
      color: c.text,
    },
    sectionHeaderSubtitle: {
      marginTop: 3,
      fontSize: 12,
      color: c.textMuted,
    },
    sectionHeaderChevron: {
      fontSize: 16,
      color: c.textMuted,
      fontWeight: '700',
    },
    memberCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.card,
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
      backgroundColor: c.surfaceRaised,
      shadowOpacity: 0,
      elevation: 0,
    },
    memberInfo: {flex: 1},
    memberName: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
      marginBottom: 3,
    },
    memberRole: {
      fontSize: 12,
      color: c.textMuted,
      textTransform: 'uppercase',
    },
    textMuted: {color: c.textMuted},
    memberRight: {
      alignItems: 'flex-end',
      gap: 6,
      marginLeft: 12,
    },
    creditText: {
      fontSize: 13,
      color: c.text,
    },
    creditEmpty: {
      color: c.danger,
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
      backgroundColor: c.surfaceRaised,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    badgeActionText: {
      color: c.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    historyButton: {
      marginTop: 2,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: c.surfaceRaised,
    },
    historyButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.primary,
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
      backgroundColor: c.card,
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
      color: c.text,
      marginBottom: 8,
    },
    modalSubtitle: {
      fontSize: 15,
      color: c.textMuted,
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
      backgroundColor: c.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    counterButtonDisabled: {
      backgroundColor: c.border,
    },
    counterButtonText: {
      fontSize: 28,
      fontWeight: '500',
      color: c.text,
      lineHeight: 30,
    },
    counterButtonTextDisabled: {
      color: c.textMuted,
    },
    counterValueWrap: {
      minWidth: 110,
      alignItems: 'center',
      marginHorizontal: 24,
    },
    counterValue: {
      fontSize: 32,
      fontWeight: '700',
      color: c.text,
    },
    counterValueLabel: {
      marginTop: 4,
      fontSize: 14,
      color: c.textMuted,
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
      backgroundColor: c.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSecondaryButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    modalPrimaryButton: {
      flex: 1.5,
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    modalPrimaryButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    modalPrimaryButtonSub: {
      fontSize: 12,
      fontWeight: '500',
      color: 'rgba(255,255,255,0.85)',
      marginTop: 1,
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
}

