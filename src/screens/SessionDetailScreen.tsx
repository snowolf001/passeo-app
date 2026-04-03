import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useApp} from '../context/AppContext';
import {sessionService} from '../services/sessionService';
import {attendanceService} from '../services/attendanceService';
import {
  SessionWithLocation,
  MembershipWithUser,
  DEFAULT_CLUB_SETTINGS,
  CheckInMode,
} from '../types';
import {RootStackParamList} from '../navigation/types';
import {formatDate} from '../utils/date';
import {openInMaps} from '../utils/maps';
import {db} from '../data/mockData';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionDetail'>;

export default function SessionDetailScreen({route, navigation}: Props) {
  const {sessionId} = route.params;
  const {
    currentMembership,
    currentClub,
    decrementCurrentMembershipCredits,
    lastCheckInEvent,
    publishCheckInEvent,
  } = useApp();

  const [session, setSession] = useState<SessionWithLocation | null>(null);
  const [checkedInMembers, setCheckedInMembers] = useState<
    MembershipWithUser[]
  >([]);
  const [loadingSession, setLoadingSession] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);

  const [showPeoplePicker, setShowPeoplePicker] = useState(false);
  const [peopleCount, setPeopleCount] = useState(1);

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
    }, 3000);
  }, []);

  const closePeoplePicker = useCallback(() => {
    if (checkingIn) {
      return;
    }
    setShowPeoplePicker(false);
    setPeopleCount(1);
  }, [checkingIn]);

  const loadData = useCallback(async () => {
    setLoadingSession(true);
    try {
      const [loadedSession, members] = await Promise.all([
        sessionService.getSessionById(sessionId),
        attendanceService.getCheckedInMembers(sessionId),
      ]);
      setSession(loadedSession);
      setCheckedInMembers(members);
    } finally {
      setLoadingSession(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadData);
    return unsub;
  }, [navigation, loadData]);

  useEffect(() => {
    return () => {
      if (snackTimer.current) {
        clearTimeout(snackTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!lastCheckInEvent) {
      return;
    }

    if (lastCheckInEvent.sessionId !== sessionId) {
      return;
    }

    setCheckedInMembers(prev => {
      const alreadyExists = prev.some(
        m => m.id === lastCheckInEvent.membershipId,
      );
      if (alreadyExists) {
        return prev;
      }

      const membership = db
        .getMemberships()
        .find(m => m.id === lastCheckInEvent.membershipId);
      if (!membership) {
        return prev;
      }

      const user = db.getUsers().find(u => u.id === membership.userId);
      if (!user) {
        return prev;
      }

      return [{...membership, user}, ...prev];
    });
  }, [lastCheckInEvent, sessionId]);

  const isCheckedIn = currentMembership
    ? checkedInMembers.some(m => m.id === currentMembership.id)
    : false;

  const availableCredits = currentMembership?.credits ?? 0;
  const hasCredits = availableCredits > 0;
  const canManualCheckIn = currentMembership
    ? ['host', 'admin', 'owner'].includes(currentMembership.role)
    : false;

  const checkInMode: CheckInMode = useMemo(() => {
    if (!currentMembership || !session) {
      return 'live';
    }

    const settings = currentClub?.settings ?? DEFAULT_CLUB_SETTINGS;

    return attendanceService.getCheckInMode({
      membership: currentMembership,
      session,
      settings,
      isAlreadyCheckedIn: isCheckedIn,
    });
  }, [currentMembership, session, currentClub, isCheckedIn]);

  const maxPeople = useMemo(() => {
    return Math.max(1, availableCredits);
  }, [availableCredits]);

  const getHelperText = () => {
    if (isCheckedIn) return null;

    switch (checkInMode) {
      case 'live':
        if (!hasCredits) return 'No credits remaining';
        return `${availableCredits} credit${
          availableCredits === 1 ? '' : 's'
        } available`;

      case 'backfill':
        if (!hasCredits) return 'No credits remaining';
        return `Backfill available · ${availableCredits} credit${
          availableCredits === 1 ? '' : 's'
        } left`;

      case 'not_allowed':
        return 'Backfill is disabled for members';

      case 'expired':
        return 'Backfill window expired';

      case 'no_credits':
        return 'No credits remaining';

      default:
        return null;
    }
  };

  const getModalTitle = () => {
    return checkInMode === 'backfill' ? 'Backfill Check-In' : 'Check In';
  };

  const getModalActionText = () => {
    return checkInMode === 'backfill' ? 'Backfill' : 'Check In';
  };

  const getStatusText = (mode: CheckInMode) => {
    switch (mode) {
      case 'live':
        return '🟢 Available now';
      case 'backfill':
        return '🟡 Backfill available';
      case 'already_checked_in':
        return '✅ You are checked in';
      case 'expired':
        return '⚪ Backfill expired';
      case 'not_allowed':
        return '⚪ Backfill not allowed';
      case 'no_credits':
        return '⚪ No credits';
      default:
        return '';
    }
  };

  const openSelfCheckInPicker = () => {
    if (
      !currentMembership ||
      !session ||
      checkingIn ||
      (checkInMode !== 'live' && checkInMode !== 'backfill')
    ) {
      return;
    }

    setPeopleCount(1);
    setShowPeoplePicker(true);
  };

  const handleSelfCheckIn = async (creditsUsed: number) => {
    if (!currentMembership || !session || checkingIn || isCheckedIn) {
      return;
    }

    setCheckingIn(true);
    try {
      const result = await attendanceService.selfCheckIn({
        membershipId: currentMembership.id,
        sessionId: session.id,
        creditsUsed,
      });

      if (result.success) {
        const checkedInAt = new Date().toISOString();
        const wasBackfill = checkInMode === 'backfill';

        showSnackbar(
          `${
            wasBackfill ? 'Backfilled' : 'Checked in'
          } successfully · ${creditsUsed} credit${
            creditsUsed === 1 ? '' : 's'
          } used`,
        );

        decrementCurrentMembershipCredits(creditsUsed);

        setCheckedInMembers(prev => {
          const alreadyExists = prev.some(m => m.id === currentMembership.id);
          if (alreadyExists) {
            return prev;
          }

          const user = db
            .getUsers()
            .find(u => u.id === currentMembership.userId);
          if (!user) {
            return prev;
          }

          return [
            {
              ...currentMembership,
              user,
              credits: Math.max(0, currentMembership.credits - creditsUsed),
            },
            ...prev,
          ];
        });

        publishCheckInEvent({
          membershipId: currentMembership.id,
          sessionId: session.id,
          checkedInAt,
        });

        setShowPeoplePicker(false);
        setPeopleCount(1);
      } else {
        Alert.alert('Check-In Failed', result.message);
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const selfCheckInButtonState = (): {
    label: string;
    disabled: boolean;
    style: object;
    textStyle: object;
  } => {
    switch (checkInMode) {
      case 'already_checked_in':
        return {
          label: '✅ Already Checked In',
          disabled: true,
          style: styles.btnCheckedIn,
          textStyle: styles.checkInBtnTextDark,
        };
      case 'no_credits':
        return {
          label: 'No Credits',
          disabled: true,
          style: styles.btnDisabled,
          textStyle: styles.checkInBtnTextDark,
        };
      case 'live':
        return {
          label: 'Check In',
          disabled: false,
          style: styles.btnCheckIn,
          textStyle: styles.checkInBtnTextLight,
        };
      case 'backfill':
        return {
          label: 'Backfill Check-In',
          disabled: false,
          style: styles.btnBackfill,
          textStyle: styles.checkInBtnTextLight,
        };
      case 'not_allowed':
        return {
          label: 'Backfill Disabled',
          disabled: true,
          style: styles.btnDisabled,
          textStyle: styles.checkInBtnTextDark,
        };
      case 'expired':
      default:
        return {
          label: 'Backfill Expired',
          disabled: true,
          style: styles.btnDisabled,
          textStyle: styles.checkInBtnTextDark,
        };
    }
  };

  const ciBtn = selfCheckInButtonState();
  const helperText = getHelperText();

  const renderMemberRow = ({item}: {item: MembershipWithUser}) => {
    const isYou = currentMembership?.id === item.id;

    return (
      <View style={styles.memberRow}>
        <View style={styles.memberLeft}>
          <Text style={styles.memberName}>{item.user.name}</Text>

          {isYou && (
            <View style={styles.youBadge}>
              <Text style={styles.youBadgeText}>You</Text>
            </View>
          )}
        </View>

        <View style={[styles.roleBadge, roleColor(item.role)]}>
          <Text style={styles.roleBadgeText}>{item.role}</Text>
        </View>
      </View>
    );
  };

  const renderContent = () => {
    if (loadingSession && !session) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color="#007AFF" />
        </View>
      );
    }

    if (!session) {
      return (
        <View style={styles.center}>
          <Text style={styles.errorText}>Session not found.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.linkText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        <View style={styles.infoBlock}>
          <Text style={styles.sessionTitle}>{session.title}</Text>
          <Text style={styles.detailRow}>
            ⏱ {formatDate(session.startTime)}
          </Text>

          {session.endTime && (
            <Text style={styles.detailRow}>
              🏁 Ends {formatDate(session.endTime)}
            </Text>
          )}

          {session.location && (
            <>
              <Text style={styles.detailRow}>📍 {session.location.name}</Text>
              <Text style={styles.addressText}>{session.location.address}</Text>
              <TouchableOpacity
                style={styles.mapsButton}
                onPress={() => openInMaps(session.location!.address)}>
                <Text style={styles.mapsButtonText}>Open in Maps</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.capacityRow}>
            <Text style={styles.capacityText}>
              👥 {checkedInMembers.length}
              {session.capacity != null ? ` / ${session.capacity}` : ''} checked
              in
            </Text>
          </View>

          <View style={styles.statusBanner}>
            <Text style={styles.statusText}>{getStatusText(checkInMode)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.checkInBtn, ciBtn.style]}
            onPress={openSelfCheckInPicker}
            disabled={ciBtn.disabled || checkingIn}>
            {checkingIn ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={[styles.checkInBtnTextBase, ciBtn.textStyle]}>
                {ciBtn.label}
              </Text>
            )}
          </TouchableOpacity>

          {helperText && <Text style={styles.helperText}>{helperText}</Text>}
        </View>

        {canManualCheckIn && session && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Host Tools</Text>
            <TouchableOpacity
              style={styles.hostButton}
              onPress={() =>
                navigation.navigate('ManualCheckIn', {sessionId: session.id})
              }>
              <Text style={styles.hostButtonText}>Manual Check-In</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Checked In ({checkedInMembers.length})
          </Text>
          {checkedInMembers.length === 0 ? (
            <Text style={styles.emptyText}>No members checked in yet.</Text>
          ) : (
            <FlatList
              data={checkedInMembers}
              keyExtractor={item => item.id}
              renderItem={renderMemberRow}
              scrollEnabled={false}
            />
          )}
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.screenRoot}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}>
          {renderContent()}
        </ScrollView>

        {snackVisible && (
          <View pointerEvents="none" style={styles.snackbar}>
            <Text style={styles.snackbarText}>{snackMsg}</Text>
          </View>
        )}

        <Modal
          visible={showPeoplePicker}
          transparent
          animationType="fade"
          onRequestClose={closePeoplePicker}>
          <View style={styles.modalOverlay}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={closePeoplePicker}
            />
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>{getModalTitle()}</Text>

              <Text style={styles.modalSubtitle}>
                You have {availableCredits} credit
                {availableCredits === 1 ? '' : 's'} available for this check-in.
              </Text>

              <View style={styles.counterRow}>
                <TouchableOpacity
                  style={[
                    styles.counterButton,
                    peopleCount <= 1 && styles.counterButtonDisabled,
                  ]}
                  onPress={() => setPeopleCount(prev => Math.max(1, prev - 1))}
                  disabled={peopleCount <= 1 || checkingIn}>
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
                  disabled={peopleCount >= maxPeople || checkingIn}>
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
                  onPress={closePeoplePicker}
                  disabled={checkingIn}>
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalPrimaryButton,
                    checkingIn && styles.modalPrimaryButtonDisabled,
                  ]}
                  onPress={() => handleSelfCheckIn(peopleCount)}
                  disabled={checkingIn}>
                  {checkingIn ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>
                      {getModalActionText()} ({peopleCount}{' '}
                      {peopleCount === 1 ? 'person' : 'people'})
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

const roleColor = (role: string): object => {
  const map: Record<string, object> = {
    owner: {backgroundColor: '#FFEDD5'},
    admin: {backgroundColor: '#EDE9FE'},
    host: {backgroundColor: '#DBEAFE'},
    member: {backgroundColor: '#F3F4F6'},
  };
  return map[role] ?? map.member;
};

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
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
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
  center: {
    flex: 1,
    minHeight: 280,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    marginBottom: 12,
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBlock: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  sessionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  detailRow: {
    fontSize: 15,
    color: '#3A3A3C',
    marginTop: 4,
  },
  addressText: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
    marginLeft: 22,
  },
  mapsButton: {
    marginTop: 8,
    marginLeft: 22,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  mapsButtonText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
  },
  capacityRow: {
    marginTop: 12,
  },
  capacityText: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBanner: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3A3A3C',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  checkInBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnCheckIn: {
    backgroundColor: '#34C759',
  },
  btnBackfill: {
    backgroundColor: '#FF9500',
  },
  btnCheckedIn: {
    backgroundColor: '#E5E5EA',
  },
  btnDisabled: {
    backgroundColor: '#E5E5EA',
  },
  checkInBtnTextBase: {
    fontSize: 17,
    fontWeight: '700',
  },
  checkInBtnTextLight: {
    color: '#FFFFFF',
  },
  checkInBtnTextDark: {
    color: '#3A3A3C',
  },
  helperText: {
    marginTop: 10,
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  hostButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  hostButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  youBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  youBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  memberName: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
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
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  modalPrimaryButtonDisabled: {
    opacity: 0.7,
  },
  modalPrimaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
