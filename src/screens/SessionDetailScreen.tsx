import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useApp} from '../context/AppContext';
import {
  ApiSession,
  ApiCheckedInMember,
  getSessionById as apiGetSessionById,
  getCheckedInMembers as apiGetCheckedInMembers,
  checkInToSession,
  getCheckInErrorMessage,
  deleteSession as apiDeleteSession,
} from '../services/api/sessionApi';
import {
  getSessionAttendees,
  SessionAttendeesResponse,
} from '../services/api/reportApi';
import {exportSessionParticipantsPdf} from '../services/pdf/sessionParticipantsPdf';
import {DEFAULT_CLUB_SETTINGS, CheckInMode} from '../types';
import {getCheckInMode} from '../utils/checkIn';
import {RootStackParamList} from '../navigation/types';
import {formatDate} from '../utils/date';
import {ApiError} from '../types/api';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';
import {trackEvent} from '../analytics/trackEvent';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionDetail'>;

export default function SessionDetailScreen({route, navigation}: Props) {
  const {sessionId} = route.params;
  console.log('🧭 sessionId from route:', sessionId);
  const {
    currentMembership,
    currentClub,
    setCurrentMembershipCredits,
    lastCheckInEvent,
    publishCheckInEvent,
  } = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [session, setSession] = useState<ApiSession | null>(null);
  const [checkedInMembers, setCheckedInMembers] = useState<
    ApiCheckedInMember[]
  >([]);
  const [attendeesReport, setAttendeesReport] =
    useState<SessionAttendeesResponse | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);

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
    setCheckedInMembers([]);
    setAttendeesReport(null);
    try {
      const [loadedSession, members] = await Promise.all([
        apiGetSessionById(sessionId),
        apiGetCheckedInMembers(sessionId),
      ]);
      setSession(loadedSession);
      setCheckedInMembers(members);

      // Load rich attendee report for hosts/admins
      const myRole = currentMembership?.role ?? '';
      if (['host', 'admin', 'owner'].includes(myRole)) {
        getSessionAttendees(sessionId)
          .then(setAttendeesReport)
          .catch(() => {});
      }
    } catch (err) {
      console.warn('[SessionDetailScreen] loadData failed:', err);
    } finally {
      setLoadingSession(false);
    }
  }, [sessionId, currentMembership?.role]);

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

    // Re-fetch the checked-in list so we have the correct flat API shape.
    apiGetCheckedInMembers(sessionId)
      .then(setCheckedInMembers)
      .catch(() => {});
  }, [lastCheckInEvent, sessionId]);

  const isCheckedIn = currentMembership
    ? checkedInMembers.some(m => m.membershipId === currentMembership.id)
    : false;

  const isSessionFull =
    session?.capacity != null && checkedInMembers.length >= session.capacity;

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

    // Cast ApiSession → Session for the backfill helper (only endTime is used internally)
    return getCheckInMode({
      membership: currentMembership,
      session: session as any,
      settings,
      isAlreadyCheckedIn: isCheckedIn,
    });
  }, [currentMembership, session, currentClub, isCheckedIn]);

  const maxPeople = useMemo(() => {
    return Math.max(1, availableCredits);
  }, [availableCredits]);

  const getHelperText = () => {
    if (isCheckedIn) return null;
    if (isSessionFull) return 'This session is full.';

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

      case 'upcoming':
        return 'Session has not started yet';

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
      case 'upcoming':
        return '🔵 Upcoming';
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
    console.log('🔥 [CHECK-IN] button pressed');
    console.log('👉 session:', session?.id);
    console.log('👉 creditsUsed:', creditsUsed);
    console.log('👉 checkingIn:', checkingIn);
    console.log('👉 isCheckedIn:', isCheckedIn);
    console.log('👉 membership:', currentMembership?.id);

    if (!currentMembership || !session) {
      console.log('❌ missing membership or session');
      Alert.alert('Error', 'Missing membership or session');
      return;
    }

    if (checkingIn) {
      console.log('⚠️ already submitting');
      return;
    }

    if (isCheckedIn) {
      console.log('⚠️ already checked in');
      Alert.alert('Info', 'You are already checked in.');
      return;
    }

    setCheckingIn(true);
    trackEvent({
      eventName: 'checkin_attempt',
      sourceScreen: 'SessionDetail',
      clubId: currentMembership.clubId,
      sessionId: session.id,
    });

    try {
      console.log('🚀 calling API...');

      const result = await checkInToSession(session.id, creditsUsed);

      console.log('✅ API SUCCESS:', result);

      const checkedInAt = result.checkedInAt ?? new Date().toISOString();
      const wasBackfill = checkInMode === 'backfill';

      trackEvent({
        eventName: 'checkin_success',
        sourceScreen: 'SessionDetail',
        clubId: currentMembership.clubId,
        sessionId: session.id,
      });

      showSnackbar(
        `${
          wasBackfill ? 'Backfilled' : 'Checked in'
        } successfully · ${creditsUsed} credit${
          creditsUsed === 1 ? '' : 's'
        } used`,
      );

      console.log('💰 syncing credits from API response');
      setCurrentMembershipCredits(result.creditsRemaining);

      console.log('👥 updating checked-in members list');
      setCheckedInMembers(prev => {
        const alreadyExists = prev.some(
          m => m.membershipId === currentMembership.id,
        );
        if (alreadyExists) {
          return prev;
        }
        const newEntry: ApiCheckedInMember = {
          membershipId: currentMembership.id,
          userId: currentMembership.userId,
          userName: '',
          role: currentMembership.role as ApiCheckedInMember['role'],
          checkedInAt,
          creditsUsed,
        };
        return [newEntry, ...prev];
      });

      console.log('📢 publish check-in event');
      publishCheckInEvent({
        membershipId: currentMembership.id,
        sessionId: session.id,
        checkedInAt,
      });

      console.log('✅ closing modal');
      setShowPeoplePicker(false);
      setPeopleCount(1);
    } catch (error) {
      console.log('❌ API ERROR:', error);

      let message = 'Network error. Please try again.';

      if (error instanceof ApiError) {
        console.log('⚠️ ApiError code:', error.code);
        message = getCheckInErrorMessage(error);
      }

      trackEvent({
        eventName: 'checkin_failed',
        sourceScreen: 'SessionDetail',
        clubId: currentMembership.clubId,
        sessionId: session.id,
        errorCode: error instanceof ApiError ? error.code : 'NETWORK_ERROR',
      });

      // 🔥 关键：一定让用户看到
      Alert.alert('Check-in failed', message);

      showSnackbar(message);
    } finally {
      console.log('🔄 done, resetting checkingIn');
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
      case 'backfill':
        if (isSessionFull) {
          return {
            label: 'Session Full',
            disabled: true,
            style: styles.btnDisabled,
            textStyle: styles.checkInBtnTextDark,
          };
        }
        if (checkInMode === 'backfill') {
          return {
            label: 'Backfill Check-In',
            disabled: false,
            style: styles.btnBackfill,
            textStyle: styles.checkInBtnTextLight,
          };
        }
        return {
          label: 'Check In',
          disabled: false,
          style: styles.btnCheckIn,
          textStyle: styles.checkInBtnTextLight,
        };
      case 'upcoming':
        return {
          label: 'Not Started Yet',
          disabled: true,
          style: styles.btnDisabled,
          textStyle: styles.checkInBtnTextDark,
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

  const handleExportSessionPdf = async () => {
    if (!attendeesReport || exportingPdf) {
      return;
    }
    setExportingPdf(true);
    trackEvent({
      eventName: 'export_pdf_attempt',
      sourceScreen: 'SessionDetail',
      clubId: currentMembership?.clubId,
      sessionId: session?.id,
    });
    try {
      await exportSessionParticipantsPdf(
        attendeesReport,
        currentClub?.name ?? 'Club',
      );
      trackEvent({
        eventName: 'export_pdf_success',
        sourceScreen: 'SessionDetail',
        clubId: currentMembership?.clubId,
        sessionId: session?.id,
      });
    } catch (err: any) {
      trackEvent({
        eventName: 'export_pdf_failed',
        sourceScreen: 'SessionDetail',
        clubId: currentMembership?.clubId,
        sessionId: session?.id,
        errorCode: err?.code ?? 'UNKNOWN',
      });
      Alert.alert('Export Failed', err?.message ?? 'Could not generate PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const canDeleteSession =
    canManualCheckIn &&
    checkedInMembers.length === 0 &&
    (attendeesReport === null || attendeesReport.summary.totalCheckIns === 0);

  const handleDeleteSession = () => {
    Alert.alert(
      'Delete Session',
      'Delete this session? This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!session) {
              return;
            }
            setDeletingSession(true);
            try {
              await apiDeleteSession(session.id);
              showSnackbar('Session deleted');
              navigation.goBack();
            } catch (err: any) {
              const code = err?.code as string | undefined;
              if (code === 'SESSION_NOT_DELETABLE') {
                Alert.alert(
                  'Cannot Delete',
                  'This session cannot be deleted because it already has attendance records.',
                );
              } else {
                Alert.alert(
                  'Error',
                  err?.message ?? 'Could not delete session. Please try again.',
                );
              }
            } finally {
              setDeletingSession(false);
            }
          },
        },
      ],
    );
  };

  const renderMemberRow = ({item}: {item: ApiCheckedInMember}) => {
    const isYou = currentMembership?.id === item.membershipId;

    return (
      <View style={styles.memberRow}>
        <View style={styles.memberLeft}>
          <Text style={styles.memberName}>{item.userName}</Text>

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
          <Text style={styles.sessionTitle}>
            {session.title ?? session.locationName ?? 'Session'}
          </Text>
          {session.title != null && session.locationName != null && (
            <Text style={styles.detailRow}>📍 {session.locationName}</Text>
          )}
          <Text style={styles.detailRow}>
            ⏱ {formatDate(session.startTime)}
          </Text>

          {session.endTime && (
            <Text style={styles.detailRow}>
              🏁 Ends {formatDate(session.endTime)}
            </Text>
          )}

          <View style={styles.capacityRow}>
            <Text style={styles.capacityText}>
              👥{' '}
              {session.capacity != null
                ? `${checkedInMembers.length} / ${session.capacity} checked in${
                    isSessionFull ? ' · Full' : ''
                  }`
                : `${checkedInMembers.length} checked in`}
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
            {canDeleteSession && (
              <TouchableOpacity
                style={[
                  styles.deleteSessionBtn,
                  deletingSession && styles.deleteSessionBtnDisabled,
                ]}
                onPress={handleDeleteSession}
                disabled={deletingSession}>
                {deletingSession ? (
                  <ActivityIndicator color="#FF3B30" />
                ) : (
                  <Text style={styles.deleteSessionBtnText}>
                    Delete Session
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Rich attendee report for hosts/admins */}
        {canManualCheckIn ? (
          <View style={styles.section}>
            <View style={styles.attendeesSectionHeader}>
              <Text style={styles.sectionTitle}>
                Attendees
                {attendeesReport
                  ? ` (${attendeesReport.summary.totalCheckIns})`
                  : checkedInMembers.length > 0
                  ? ` (${checkedInMembers.length})`
                  : ''}
              </Text>
              {attendeesReport && attendeesReport.attendees.length > 0 && (
                <TouchableOpacity
                  style={[
                    styles.exportPdfBtn,
                    exportingPdf && styles.exportPdfBtnDisabled,
                  ]}
                  onPress={handleExportSessionPdf}
                  disabled={exportingPdf}>
                  {exportingPdf ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.exportPdfBtnText}>Export PDF</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {attendeesReport && (
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>
                    {attendeesReport.summary.totalParticipation}
                  </Text>
                  <Text style={styles.summaryLabel}>Total Participation</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>
                    {attendeesReport.summary.totalCheckIns}
                  </Text>
                  <Text style={styles.summaryLabel}>Check-ins</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>
                    {attendeesReport.summary.uniqueMembers}
                  </Text>
                  <Text style={styles.summaryLabel}>Unique Members</Text>
                </View>
              </View>
            )}

            {attendeesReport && attendeesReport.attendees.length === 0 ? (
              <Text style={styles.emptyText}>No attendees yet.</Text>
            ) : attendeesReport ? (
              <FlatList
                data={attendeesReport.attendees}
                keyExtractor={item => item.attendanceId}
                renderItem={({item}) => (
                  <View style={styles.attendeeRow}>
                    <View style={styles.attendeeLeft}>
                      <Text style={styles.memberName}>{item.memberName}</Text>
                      <View style={styles.attendeeMeta}>
                        <View
                          style={[
                            styles.checkInTypeBadge,
                            checkInTypeColor(item.checkInType),
                          ]}>
                          <Text style={styles.checkInTypeBadgeText}>
                            {item.checkInType}
                          </Text>
                        </View>
                        <Text style={styles.attendeeDetail}>
                          {item.creditsUsed} credit
                          {item.creditsUsed !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      {item.checkedInByName && (
                        <Text style={styles.checkedInByText}>
                          by {item.checkedInByName}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.attendeeTime}>
                      {formatDate(item.checkedInAt)}
                    </Text>
                  </View>
                )}
                scrollEnabled={false}
              />
            ) : checkedInMembers.length === 0 ? (
              <Text style={styles.emptyText}>No attendees yet.</Text>
            ) : (
              <FlatList
                data={checkedInMembers}
                keyExtractor={item => item.membershipId}
                renderItem={renderMemberRow}
                scrollEnabled={false}
              />
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Checked In ({checkedInMembers.length})
            </Text>
            {checkedInMembers.length === 0 ? (
              <Text style={styles.emptyText}>No members checked in yet.</Text>
            ) : (
              <FlatList
                data={checkedInMembers}
                keyExtractor={item => item.membershipId}
                renderItem={renderMemberRow}
                scrollEnabled={false}
              />
            )}
          </View>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
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
                    <>
                      <Text style={styles.modalPrimaryButtonText}>
                        {getModalActionText()}
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

const roleColor = (role: string): object => {
  const map: Record<string, object> = {
    owner: {backgroundColor: '#FFEDD5'},
    admin: {backgroundColor: '#EDE9FE'},
    host: {backgroundColor: '#DBEAFE'},
    member: {backgroundColor: '#F3F4F6'},
  };
  return map[role] ?? map.member;
};

const checkInTypeColor = (type: string): object => {
  const map: Record<string, object> = {
    live: {backgroundColor: '#DCFCE7'},
    backfill: {backgroundColor: '#FEF3C7'},
    manual: {backgroundColor: '#DBEAFE'},
  };
  return map[type] ?? {backgroundColor: '#F3F4F6'};
};

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
    container: {
      flex: 1,
      backgroundColor: c.background,
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
      color: c.danger,
      marginBottom: 12,
    },
    linkText: {
      color: c.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    infoBlock: {
      backgroundColor: c.card,
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    sessionTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: c.text,
      marginBottom: 12,
    },
    detailRow: {
      fontSize: 15,
      color: c.text,
      marginTop: 4,
    },
    addressText: {
      fontSize: 13,
      color: c.textMuted,
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
      backgroundColor: c.surfaceRaised,
    },
    mapsButtonText: {
      fontSize: 13,
      color: c.primary,
      fontWeight: '600',
    },
    capacityRow: {
      marginTop: 12,
    },
    capacityText: {
      fontSize: 14,
      color: c.textMuted,
    },
    statusBanner: {
      marginTop: 12,
      padding: 10,
      borderRadius: 10,
      backgroundColor: c.surfaceRaised,
    },
    statusText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
    },
    section: {
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
      marginBottom: 12,
    },
    attendeesSectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    exportPdfBtn: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
      minWidth: 90,
      alignItems: 'center',
    },
    exportPdfBtnDisabled: {
      backgroundColor: c.primary,
      opacity: 0.5,
    },
    exportPdfBtnText: {
      color: '#FFF',
      fontSize: 12,
      fontWeight: '700',
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
      backgroundColor: c.border,
    },
    btnDisabled: {
      backgroundColor: c.border,
    },
    checkInBtnTextBase: {
      fontSize: 17,
      fontWeight: '700',
    },
    checkInBtnTextLight: {
      color: '#FFFFFF',
    },
    checkInBtnTextDark: {
      color: c.text,
    },
    helperText: {
      marginTop: 10,
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
    },
    hostButton: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    hostButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    deleteSessionBtn: {
      marginTop: 10,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: c.danger,
      backgroundColor: '#FFF1F0',
    },
    deleteSessionBtnDisabled: {
      opacity: 0.5,
    },
    deleteSessionBtnText: {
      color: c.danger,
      fontSize: 16,
      fontWeight: '700',
    },
    memberLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    youBadge: {
      backgroundColor: c.primary,
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
      borderBottomColor: c.border,
    },
    memberName: {
      fontSize: 15,
      color: c.text,
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
      color: c.textMuted,
      fontSize: 14,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 14,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: c.surfaceRaised,
      borderRadius: 10,
      padding: 12,
      alignItems: 'center',
    },
    summaryValue: {
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
    },
    summaryLabel: {
      fontSize: 11,
      color: c.textMuted,
      marginTop: 2,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    attendeeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    attendeeLeft: {
      flex: 1,
      marginRight: 8,
    },
    attendeeMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 3,
    },
    attendeeDetail: {
      fontSize: 12,
      color: c.textMuted,
    },
    attendeeTime: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
    checkedInByText: {
      fontSize: 11,
      color: c.textMuted,
      marginTop: 2,
    },
    checkInTypeBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 5,
    },
    checkInTypeBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      color: '#374151',
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
    modalPrimaryButtonSub: {
      fontSize: 12,
      fontWeight: '500',
      color: 'rgba(255,255,255,0.85)',
      marginTop: 1,
    },
  });
}
