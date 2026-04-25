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
  Linking,
  Platform,
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
  getSessionIntentSummary,
  setSessionIntent,
  ApiSessionIntentSummary,
  updateSession,
} from '../services/api/sessionApi';
import {getClubMembers, ApiClubMember} from '../services/api/clubApi';
import {
  getSessionAttendees,
  SessionAttendeesResponse,
} from '../services/api/reportApi';
import {exportSessionParticipantsPdf} from '../services/pdf/sessionParticipantsPdf';
import {DEFAULT_CLUB_SETTINGS, CheckInMode} from '../types';
import {getCheckInMode} from '../utils/checkIn';
import {RootStackParamList} from '../navigation/types';
import {formatDate, formatTime} from '../utils/date';
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
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportFetchFailed, setReportFetchFailed] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);

  const [intentSummary, setIntentSummary] =
    useState<ApiSessionIntentSummary | null>(null);
  const [submittingIntent, setSubmittingIntent] = useState(false);
  const [goingExpanded, setGoingExpanded] = useState(true);
  const [checkedInExpanded, setCheckedInExpanded] = useState(false);
  const expandInitializedRef = useRef(false);

  const [showPeoplePicker, setShowPeoplePicker] = useState(false);
  const [peopleCount, setPeopleCount] = useState(1);

  const [hostEditVisible, setHostEditVisible] = useState(false);
  const [hostEditMembers, setHostEditMembers] = useState<ApiClubMember[]>([]);
  const [hostEditSelectedId, setHostEditSelectedId] = useState<string | null>(
    null,
  );
  const [hostEditLoading, setHostEditLoading] = useState(false);
  const [hostEditSaving, setHostEditSaving] = useState(false);

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

  const loadData = useCallback(
    async (softRefresh = false) => {
      if (!softRefresh) {
        setLoadingSession(true);
        // Only clear if not softly refreshing
        // setCheckedInMembers([]);
        // setAttendeesReport(null);
      }
      setReportFetchFailed(false);
      try {
        const [loadedSession, members, intentResult] = await Promise.all([
          apiGetSessionById(sessionId),
          apiGetCheckedInMembers(sessionId),
          getSessionIntentSummary(sessionId).catch(err => {
            console.warn('[SessionDetailScreen] intent summary failed:', err);
            return null;
          }),
        ]);
        setSession(loadedSession);
        setCheckedInMembers(members);
        setIntentSummary(intentResult);

        // Load rich attendee report for hosts/owners
        const myRole = currentMembership?.role ?? '';
        if (['host', 'owner'].includes(myRole)) {
          if (!softRefresh) setLoadingReport(true);
          getSessionAttendees(sessionId)
            .then(report => {
              setAttendeesReport(report);
              setReportFetchFailed(false);
            })
            .catch(err => {
              console.warn(
                '[SessionDetailScreen] attendee report failed:',
                err,
              );
              setReportFetchFailed(true);
            })
            .finally(() => {
              if (!softRefresh) setLoadingReport(false);
            });
        }
      } catch (err) {
        console.warn('[SessionDetailScreen] loadData failed:', err);
      } finally {
        if (!softRefresh) {
          setLoadingSession(false);
        }
      }
    },
    [sessionId, currentMembership?.role],
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => loadData(false));
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

    // A check-in happened elsewhere (e.g. ManualCheckInScreen)
    // Perform a soft refresh to keep attendees report synced without flicker
    loadData(true);
  }, [lastCheckInEvent, sessionId, loadData]);

  // Initialize expand/collapse state once when session first loads
  useEffect(() => {
    if (!session || expandInitializedRef.current) {
      return;
    }
    const isBeforeStart = new Date(session.startTime).getTime() > Date.now();
    setGoingExpanded(isBeforeStart);
    setCheckedInExpanded(!isBeforeStart);
    expandInitializedRef.current = true;
  }, [session]);

  const isCheckedIn = currentMembership
    ? checkedInMembers.some(m => m.membershipId === currentMembership.id)
    : false;

  const isSessionFull =
    session?.capacity != null && checkedInMembers.length >= session.capacity;

  const availableCredits = currentMembership?.credits ?? 0;
  const hasCredits = availableCredits > 0;
  const canManualCheckIn = currentMembership
    ? ['host', 'owner'].includes(currentMembership.role)
    : false;

  const sessionStarted = session
    ? new Date(session.startTime).getTime() <= Date.now()
    : false;

  const checkedInMemberIds = useMemo(
    () => new Set(checkedInMembers.map(m => m.membershipId)),
    [checkedInMembers],
  );

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
        // Hack: trigger a refresh by including a random timestamp or similar
      });

      console.log('✅ closing modal');
      setShowPeoplePicker(false);
      setPeopleCount(1);

      // Perform a soft refresh to ensure attendees report and capacity are 100% accurate
      loadData(true);
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
      const outputPath = await exportSessionParticipantsPdf(
        attendeesReport,
        currentClub?.name ?? 'Club',
      );
      trackEvent({
        eventName: 'export_pdf_success',
        sourceScreen: 'SessionDetail',
        clubId: currentMembership?.clubId,
        sessionId: session?.id,
      });
      navigation.navigate('PdfPreview', {
        url: `file://${outputPath}`,
        title: 'Session Participants',
        filename: outputPath.split('/').pop(),
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

  const openHostEdit = useCallback(() => {
    if (!currentMembership) {
      return;
    }
    setHostEditSelectedId(session?.host?.membershipId ?? null);
    setHostEditVisible(true);
    setHostEditLoading(true);
    getClubMembers(currentMembership.clubId)
      .then(members => {
        setHostEditMembers(
          members.filter(
            m => (m.role === 'owner' || m.role === 'host') && m.active,
          ),
        );
      })
      .catch(() => {})
      .finally(() => setHostEditLoading(false));
  }, [currentMembership, session?.host?.membershipId]);

  const saveHostEdit = useCallback(async () => {
    if (!session) {
      return;
    }
    setHostEditSaving(true);
    try {
      const updated = await updateSession(session.id, {
        hostMembershipId: hostEditSelectedId,
      });
      setSession(updated);
      setHostEditVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to update host.');
    } finally {
      setHostEditSaving(false);
    }
  }, [session, hostEditSelectedId]);

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

  const handleToggleIntent = async () => {
    if (!session || !currentMembership || submittingIntent) {
      return;
    }
    const going = !(intentSummary?.currentMemberGoing ?? false);
    setSubmittingIntent(true);
    try {
      await setSessionIntent(session.id, going);
      const updated = await getSessionIntentSummary(session.id);
      setIntentSummary(updated);
    } catch (err) {
      console.warn('[SessionDetailScreen] toggle intent failed:', err);
      Alert.alert(
        'Error',
        'Could not update your attendance plan. Please try again.',
      );
    } finally {
      setSubmittingIntent(false);
    }
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
    // 调试日志
    console.log('[SessionDetail] role =', currentMembership?.role);
    console.log('[SessionDetail] canManualCheckIn =', canManualCheckIn);
    console.log('[SessionDetail] loadingReport =', loadingReport);
    console.log('[SessionDetail] hasAttendeesReport =', !!attendeesReport);
    console.log('[SessionDetail] reportFetchFailed =', reportFetchFailed);
    console.log(
      '[SessionDetail] attendeeCount =',
      attendeesReport?.attendees?.length ?? null,
    );
    console.log('[SessionDetail] sessionId =', sessionId);

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
            <TouchableOpacity
              onPress={() =>
                openMap((session as any).address || session.locationName!)
              }
              activeOpacity={0.7}
              style={styles.locationContainer}>
              <Text style={styles.locationText}>📍 {session.locationName}</Text>
              {(session as any).address ? (
                <Text style={styles.locationAddressText}>
                  {(session as any).address}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
          <Text style={styles.detailRow}>
            ⏱ {formatDate(session.startTime)} → {formatTime(session.endTime)}
          </Text>

          {canManualCheckIn ? (
            <View style={styles.hostRow}>
              <Text style={styles.detailRow}>
                👤 Host:{' '}
                {session.host != null ? session.host.displayName : 'No host'}
              </Text>
              <TouchableOpacity onPress={openHostEdit}>
                <Text style={styles.changeHostLink}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            session.host != null && (
              <Text style={styles.detailRow}>
                👤 Host: {session.host.displayName}
              </Text>
            )
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

        {intentSummary?.enabled && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              onPress={() => setGoingExpanded(prev => !prev)}
              activeOpacity={0.7}>
              <Text style={[styles.sectionTitle, {marginBottom: 0}]}>
                Going ({intentSummary.count})
              </Text>
              <Text style={styles.collapseIcon}>
                {goingExpanded ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
            {goingExpanded && (
              <>
                {!sessionStarted && (
                  <TouchableOpacity
                    style={[
                      styles.intentBtn,
                      intentSummary.currentMemberGoing &&
                        styles.intentBtnActive,
                    ]}
                    onPress={handleToggleIntent}
                    disabled={submittingIntent}>
                    {submittingIntent ? (
                      <ActivityIndicator
                        color={
                          intentSummary.currentMemberGoing
                            ? '#34C759'
                            : '#007AFF'
                        }
                      />
                    ) : (
                      <Text
                        style={[
                          styles.intentBtnText,
                          intentSummary.currentMemberGoing &&
                            styles.intentBtnTextActive,
                        ]}>
                        {intentSummary.currentMemberGoing
                          ? "You're going ✓"
                          : "I'm going"}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
                {intentSummary.members.length === 0 ? (
                  <Text style={[styles.emptyText, {marginTop: 10}]}>
                    Nobody has marked going yet.
                  </Text>
                ) : (
                  intentSummary.members.map(member => (
                    <View
                      key={member.membershipId}
                      style={styles.intentMemberRow}>
                      <Text style={styles.memberName}>
                        {member.displayName}
                      </Text>
                      {checkedInMemberIds.has(member.membershipId) && (
                        <View style={styles.checkedInBadge}>
                          <Text style={styles.checkedInBadgeText}>
                            Checked in ✓
                          </Text>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </>
            )}
          </View>
        )}

        {checkInMode !== 'already_checked_in' && checkInMode !== 'expired' && (
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
        )}

        {canManualCheckIn && session && checkInMode !== 'expired' && (
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

        {/* Rich attendee report for hosts/owners */}
        {canManualCheckIn ? (
          <View style={styles.section}>
            <View style={styles.attendeesSectionHeader}>
              <TouchableOpacity
                style={styles.collapsibleTitleRow}
                onPress={() => setCheckedInExpanded(prev => !prev)}
                activeOpacity={0.7}>
                <Text style={[styles.sectionTitle, {marginBottom: 0}]}>
                  Attendees
                  {attendeesReport
                    ? ` (${attendeesReport.summary.totalCheckIns})`
                    : checkedInMembers.length > 0
                    ? ` (${checkedInMembers.length})`
                    : ''}
                </Text>
                <Text style={styles.collapseIcon}>
                  {checkedInExpanded ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>
              <View
                style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                {loadingReport && (
                  <ActivityIndicator size="small" color="#8E8E93" />
                )}

                {reportFetchFailed && !loadingReport && (
                  <TouchableOpacity onPress={() => loadData(false)}>
                    <Text style={styles.retryText}>Retry</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.exportPdfBtn,
                    (exportingPdf ||
                      reportFetchFailed ||
                      !attendeesReport ||
                      attendeesReport.attendees.length === 0) &&
                      styles.exportPdfBtnDisabled,
                  ]}
                  onPress={handleExportSessionPdf}
                  disabled={
                    exportingPdf ||
                    reportFetchFailed ||
                    !attendeesReport ||
                    attendeesReport.attendees.length === 0
                  }>
                  {exportingPdf ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.exportPdfBtnText}>Export PDF</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {checkedInExpanded && (
              <>
                {reportFetchFailed && !loadingReport && (
                  <Text
                    style={[
                      styles.helperText,
                      {
                        color: colors.danger,
                        marginBottom: 12,
                        marginTop: -6,
                        textAlign: 'left',
                      },
                    ]}>
                    Could not load attendee report. Retry to enable export.
                  </Text>
                )}

                {attendeesReport && (
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryCard}>
                      <Text style={styles.summaryValue}>
                        {attendeesReport.summary.totalParticipation}
                      </Text>
                      <Text style={styles.summaryLabel}>
                        Total Credits Used
                      </Text>
                    </View>
                    <View style={styles.summaryCard}>
                      <Text style={styles.summaryValue}>
                        {attendeesReport.summary.totalCheckIns}
                      </Text>
                      <Text style={styles.summaryLabel}>
                        Check{'\u2011'}ins
                      </Text>
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
                        <View style={styles.attendeeHeaderRow}>
                          <Text style={styles.memberName}>
                            {item.memberName}
                          </Text>
                          <Text style={styles.attendeeTime}>
                            {formatDate(item.checkedInAt)}
                          </Text>
                        </View>
                        <Text style={styles.attendeeMethodText}>
                          {`${getCheckInTypeLabel(item.checkInType)} · ${
                            item.creditsUsed
                          } credit${item.creditsUsed === 1 ? '' : 's'}`}
                        </Text>
                        {item.creditsUsed > 1 && (
                          <Text style={styles.attendeeSubText}>
                            Includes guests
                          </Text>
                        )}
                        {item.checkedInByName &&
                          item.checkedInByName !== item.memberName && (
                            <Text style={styles.checkedInByText}>
                              by {item.checkedInByName}
                            </Text>
                          )}
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
              </>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              onPress={() => setCheckedInExpanded(prev => !prev)}
              activeOpacity={0.7}>
              <Text style={[styles.sectionTitle, {marginBottom: 0}]}>
                Checked In ({checkedInMembers.length})
              </Text>
              <Text style={styles.collapseIcon}>
                {checkedInExpanded ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
            {checkedInExpanded && (
              <>
                {checkedInMembers.length === 0 ? (
                  <Text style={[styles.emptyText, {marginTop: 10}]}>
                    No members checked in yet.
                  </Text>
                ) : (
                  <FlatList
                    data={checkedInMembers}
                    keyExtractor={item => item.membershipId}
                    renderItem={renderMemberRow}
                    scrollEnabled={false}
                  />
                )}
              </>
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

        {/* Change Host modal */}
        <Modal
          visible={hostEditVisible}
          transparent
          animationType="fade"
          onRequestClose={() => !hostEditSaving && setHostEditVisible(false)}>
          <View style={styles.modalOverlay}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => !hostEditSaving && setHostEditVisible(false)}
            />
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Change Host</Text>

              {hostEditLoading ? (
                <ActivityIndicator
                  size="small"
                  color="#007AFF"
                  style={{marginVertical: 16}}
                />
              ) : (
                [null, ...hostEditMembers].map(member => {
                  const isNoHost = member === null;
                  const isSelected = isNoHost
                    ? hostEditSelectedId === null
                    : hostEditSelectedId === member.membershipId;
                  const isCurrentUser =
                    !isNoHost && member.membershipId === currentMembership?.id;
                  return (
                    <TouchableOpacity
                      key={isNoHost ? '__none__' : member.membershipId}
                      style={[
                        styles.locationOption,
                        isSelected && styles.locationOptionSelected,
                      ]}
                      activeOpacity={0.7}
                      onPress={() =>
                        setHostEditSelectedId(
                          isNoHost ? null : member.membershipId,
                        )
                      }>
                      <View style={styles.locationRadio}>
                        {isSelected && <View style={styles.locationRadioDot} />}
                      </View>
                      <View style={styles.locationTextWrap}>
                        <Text
                          style={[
                            styles.locationName,
                            isSelected && styles.locationNameSelected,
                          ]}>
                          {isNoHost
                            ? 'No Host'
                            : `${member.userName}${
                                isCurrentUser ? ' (You)' : ''
                              }`}
                        </Text>
                        {!isNoHost && (
                          <Text style={styles.locationAddress}>
                            {member.role}
                          </Text>
                        )}
                      </View>
                      {isSelected && (
                        <Text style={styles.locationCheck}>✓</Text>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalSecondaryButton}
                  onPress={() => setHostEditVisible(false)}
                  disabled={hostEditSaving}>
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalPrimaryButton,
                    hostEditSaving && styles.modalPrimaryButtonDisabled,
                  ]}
                  onPress={saveHostEdit}
                  disabled={hostEditSaving}>
                  {hostEditSaving ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>Save</Text>
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
    host: {backgroundColor: '#DBEAFE'},
    member: {backgroundColor: '#F3F4F6'},
  };
  return map[role] ?? map.member;
};

function openMap(locationName: string) {
  if (!locationName) return;
  const encoded = encodeURIComponent(locationName);

  const url = Platform.select({
    ios: `maps:0,0?q=${encoded}`,
    android: `geo:0,0?q=${encoded}`,
  });

  if (url) {
    Linking.openURL(url).catch(() => {
      // fallback
      const fallback = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
      Linking.openURL(fallback).catch(e =>
        console.log('Map fallback failed', e),
      );
    });
  } else {
    const fallback = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    Linking.openURL(fallback).catch(e => console.log('Map fallback failed', e));
  }
}

function getCheckInTypeLabel(type: string): string {
  switch (type) {
    case 'live':
      return 'Self check-in';
    case 'manual':
      return 'Checked in by host';
    case 'backfill':
      return 'Backfilled';
    default:
      return 'Check-in';
  }
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
    locationContainer: {
      marginTop: 8,
      paddingVertical: 4,
    },
    locationText: {
      fontSize: 15,
      color: c.primary,
      fontWeight: '600',
    },
    locationAddressText: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 4,
      marginLeft: 22,
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
    retryText: {
      color: c.primary,
      fontSize: 13,
      fontWeight: '600',
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
      paddingVertical: 12,
      paddingHorizontal: 6,
      alignItems: 'center',
    },
    summaryValue: {
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
    },
    summaryLabel: {
      fontSize: 10,
      color: c.textMuted,
      marginTop: 2,
      textTransform: 'uppercase',
      fontWeight: '600',
      textAlign: 'center',
    },
    attendeeRow: {
      flexDirection: 'column',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    attendeeHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    attendeeMethodText: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '500',
      marginTop: 4,
    },
    attendeeSubText: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 2,
    },
    attendeeTime: {
      fontSize: 12,
      color: c.textMuted,
    },
    checkedInByText: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 2,
      opacity: 0.8,
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
    intentBtn: {
      borderWidth: 1.5,
      borderColor: '#007AFF',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    intentBtnActive: {
      backgroundColor: 'rgba(52,199,89,0.08)',
      borderColor: '#34C759',
    },
    intentBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#007AFF',
    },
    intentBtnTextActive: {
      color: '#34C759',
    },
    intentCountText: {
      marginTop: 10,
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
    },
    collapsibleHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    collapsibleTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    collapseIcon: {
      fontSize: 11,
      color: c.textMuted,
      fontWeight: '600',
      marginLeft: 4,
    },
    intentMemberRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    goingSummaryText: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 8,
      marginBottom: 4,
    },
    checkedInBadge: {
      backgroundColor: '#D1FAE5',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    checkedInBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#065F46',
    },
    hostRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    changeHostLink: {
      fontSize: 14,
      color: '#007AFF',
      fontWeight: '500',
    },
    locationOption: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
      backgroundColor: c.card,
    },
    locationOptionSelected: {
      borderColor: '#007AFF',
      backgroundColor: '#EFF6FF',
    },
    locationRadio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: '#007AFF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    locationRadioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#007AFF',
    },
    locationTextWrap: {
      flex: 1,
    },
    locationName: {
      fontSize: 15,
      fontWeight: '500',
      color: c.text,
    },
    locationNameSelected: {
      color: '#007AFF',
      fontWeight: '600',
    },
    locationAddress: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 2,
    },
    locationCheck: {
      fontSize: 16,
      color: '#007AFF',
      marginLeft: 8,
    },
  });
}
