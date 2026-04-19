import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {SafeAreaView} from 'react-native-safe-area-context';
import {KeyboardAwareScrollView} from 'react-native-keyboard-aware-scroll-view';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useApp} from '../context/AppContext';
import {RootStackParamList} from '../navigation/types';
import {
  getSessionsBreakdown,
  SessionBreakdownItem,
  SessionsBreakdownResponse,
  SessionAttendeeItem,
} from '../services/api/reportApi';
import {exportSummaryReportPdf} from '../services/reportPdfService';
import {formatDate} from '../utils/date';
import {useAppTheme} from '../theme/useAppTheme';
// NOTE: If this screen needs to gate on Pro in the future, use:
//   import {useClubSubscription} from '../hooks/useClubSubscription';
//   const { status } = useClubSubscription(currentClub?.id);
//   const isPro = status?.isPro ?? false;
//   navigation.navigate('ClubPro') to send users to the upgrade screen.
// Do NOT use useProStatus() — it reads from a local cache, not the backend.
// The backend club subscription status is the source of truth for Pro gating.
import type {ThemeColors} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Reports'>;

function toYMD(d: Date): string {
  return d.toISOString().split('T')[0];
}
function ymdToISOStart(s: string): string {
  return `${s}T00:00:00.000Z`;
}
function ymdToISOEnd(s: string): string {
  return `${s}T23:59:59.999Z`;
}
function checkInTypeColor(type: string): string {
  const map: Record<string, string> = {
    live: '#DCFCE7',
    backfill: '#FEF3C7',
    manual: '#DBEAFE',
  };
  return map[type] ?? '#F3F4F6';
}

const PRESETS = [
  {label: 'Last 7 days', days: 7},
  {label: 'Last 30 days', days: 30},
  {label: 'Last 90 days', days: 90},
];

export default function ReportsScreen({navigation}: Props) {
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const {currentClub} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Date-range report ─────────────────────────────────────────────────────
  const [startDate, setStartDate] = useState(
    toYMD(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
  );
  const [endDate, setEndDate] = useState(toYMD(new Date()));
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeData, setRangeData] = useState<SessionsBreakdownResponse | null>(
    null,
  );
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  // Restore expandedSessions state for session expand/collapse
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set(),
  );

  const applyPreset = (days: number) => {
    setStartDate(toYMD(new Date(Date.now() - days * 24 * 60 * 60 * 1000)));
    setEndDate(toYMD(new Date()));
  };

  const runRangeReport = useCallback(async () => {
    if (!currentClub) {
      return;
    }
    setRangeLoading(true);
    setRangeError(null);
    setRangeData(null);
    try {
      const result = await getSessionsBreakdown({
        clubId: currentClub.id,
        startDate: ymdToISOStart(startDate),
        endDate: ymdToISOEnd(endDate),
      });
      setRangeData(result);
    } catch {
      setRangeError('Failed to load report. Please try again.');
    } finally {
      setRangeLoading(false);
    }
  }, [currentClub, startDate, endDate]);

  const toggleSession = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const handleExportSummaryPdf = async () => {
    if (!rangeData || exportingPdf) {
      return;
    }
    setExportingPdf(true);
    try {
      const outputPath = await exportSummaryReportPdf(
        rangeData,
        currentClub?.name ?? 'Club',
        startDate,
        endDate,
      );
      if (outputPath) {
        navigation.navigate('PdfPreview', {
          url: `file://${outputPath}`,
          title: 'Summary Report',
          filename: outputPath.split('/').pop(),
        });
      }
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message ?? 'Could not generate PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const renderAttendeeRow = (attendee: SessionAttendeeItem) => (
    <View key={attendee.attendanceId} style={styles.attendeeRow}>
      <Text style={styles.attendeeName}>{attendee.memberName}</Text>
      <View style={styles.attendeeRight}>
        <Text style={styles.attendeeCredits}>
          Participation: {attendee.creditsUsed}
        </Text>
        <View
          style={[
            styles.typeBadge,
            {backgroundColor: checkInTypeColor(attendee.checkInType)},
          ]}>
          <Text style={styles.typeBadgeText}>{attendee.checkInType}</Text>
        </View>
      </View>
    </View>
  );

  const renderSessionCard = (session: SessionBreakdownItem) => {
    const isExpanded = expandedSessions.has(session.sessionId);
    const label = session.title ?? session.locationName ?? 'Session';
    return (
      <View key={session.sessionId} style={styles.sessionCard}>
        <TouchableOpacity
          style={styles.sessionHeader}
          onPress={() => toggleSession(session.sessionId)}
          activeOpacity={0.7}>
          <View style={styles.sessionHeaderLeft}>
            <Text style={styles.sessionLabel}>{label}</Text>
            {session.locationName && session.title && (
              <Text style={styles.sessionMeta}>{session.locationName}</Text>
            )}
            <Text style={styles.sessionMeta}>
              {formatDate(session.startsAt)}
            </Text>
          </View>
          <View style={styles.sessionHeaderRight}>
            <Text style={styles.sessionCount}>{session.totalCheckIns}</Text>
            <Text style={styles.sessionCountLabel}>check-ins</Text>
            <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
          </View>
        </TouchableOpacity>
        {isExpanded && (
          <View style={styles.attendeeList}>
            {session.attendees.length === 0 ? (
              <Text style={styles.emptyText}>No check-ins recorded.</Text>
            ) : (
              session.attendees.map(renderAttendeeRow)
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAwareScrollView
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
        extraScrollHeight={24}
        contentContainerStyle={styles.scroll}>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: colors.text,
            marginBottom: 18,
            marginTop: 2,
          }}>
          Reports
        </Text>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, {marginBottom: 12}]}>
            Date Range
          </Text>
          <View style={styles.presetRow}>
            {PRESETS.map(p => (
              <TouchableOpacity
                key={p.label}
                style={styles.presetBtn}
                onPress={() => applyPreset(p.days)}>
                <Text style={styles.presetBtnText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>From</Text>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => setShowStartPicker(true)}
                activeOpacity={0.7}>
                <Text
                  style={{color: startDate ? colors.text : colors.textMuted}}>
                  {startDate || 'YYYY-MM-DD'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dateDivider} />
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>To</Text>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => setShowEndPicker(true)}
                activeOpacity={0.7}>
                <Text style={{color: endDate ? colors.text : colors.textMuted}}>
                  {endDate || 'YYYY-MM-DD'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {showStartPicker && (
            <DateTimePicker
              mode="date"
              value={startDate ? new Date(startDate) : new Date()}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(e: DateTimePickerEvent, d?: Date) => {
                setShowStartPicker(Platform.OS === 'ios');
                if (e.type === 'set' && d) {
                  const sy = d.getFullYear();
                  const sm = String(d.getMonth() + 1).padStart(2, '0');
                  const sd = String(d.getDate()).padStart(2, '0');
                  setStartDate(`${sy}-${sm}-${sd}`);
                } else if (Platform.OS !== 'ios') {
                  setShowStartPicker(false);
                }
              }}
            />
          )}
          {showEndPicker && (
            <DateTimePicker
              mode="date"
              value={endDate ? new Date(endDate) : new Date()}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(e: DateTimePickerEvent, d?: Date) => {
                setShowEndPicker(Platform.OS === 'ios');
                if (e.type === 'set' && d) {
                  const ey = d.getFullYear();
                  const em = String(d.getMonth() + 1).padStart(2, '0');
                  const ed = String(d.getDate()).padStart(2, '0');
                  setEndDate(`${ey}-${em}-${ed}`);
                } else if (Platform.OS !== 'ios') {
                  setShowEndPicker(false);
                }
              }}
            />
          )}
          <TouchableOpacity
            style={[
              styles.runBtn,
              rangeLoading && styles.runBtnDisabled,
              {marginTop: 10, marginBottom: 6},
            ]}
            onPress={runRangeReport}
            disabled={rangeLoading}>
            {rangeLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={[styles.runBtnText, {fontSize: 17}]}>
                Generate Report
              </Text>
            )}
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 12,
              color: '#9CA3AF',
              textAlign: 'center',
              marginTop: 2,
            }}>
            Generate attendance summaries and insights for your club
          </Text>
        </View>
        {rangeError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{rangeError}</Text>
          </View>
        )}
        {rangeData && (
          <>
            {/* Export PDF */}
            <TouchableOpacity
              style={[
                styles.exportPdfBtn,
                exportingPdf && styles.exportPdfBtnDisabled,
              ]}
              onPress={handleExportSummaryPdf}
              disabled={exportingPdf}>
              {exportingPdf ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.exportPdfBtnText}>⬇ Export PDF</Text>
              )}
            </TouchableOpacity>

            {/* Summary cards */}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {rangeData.summary.totalSessions}
                </Text>
                <Text style={styles.summaryLabel}>Total Sessions</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {rangeData.summary.uniqueMembers}
                </Text>
                <Text style={styles.summaryLabel}>Unique Members</Text>
              </View>
            </View>
            <View style={styles.summaryPrimaryCard}>
              <Text style={styles.summaryPrimaryValue}>
                {rangeData.summary.totalParticipation}
              </Text>
              <Text style={styles.summaryPrimaryLabel}>
                Total Participation
              </Text>
            </View>
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryCard, {width: '100%'}]}>
                <Text style={styles.summaryValue}>
                  {rangeData.summary.totalCheckIns}
                </Text>
                <Text style={styles.summaryLabel}>Total Check-ins</Text>
              </View>
            </View>

            {/* Per-session breakdown */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {rangeData.sessions.length} Session
                {rangeData.sessions.length !== 1 ? 's' : ''} · tap to see who
                attended
              </Text>
              {rangeData.sessions.length === 0 ? (
                <Text style={styles.emptyText}>
                  No sessions in selected range.
                </Text>
              ) : (
                rangeData.sessions.map(renderSessionCard)
              )}
            </View>
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: c.background},
    scroll: {padding: 16, paddingBottom: 40},
    centerPad: {paddingVertical: 16},
    section: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 14,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    liveBadge: {
      backgroundColor: '#FF3B30',
      borderRadius: 5,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    liveBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      color: '#FFF',
      letterSpacing: 0.5,
    },
    refreshBtn: {fontSize: 13, color: c.primary, fontWeight: '600'},
    linkRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    linkText: {fontSize: 15, color: c.text},
    chevronLg: {fontSize: 22, color: c.textMuted},
    // Last session
    lastSessionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    lastSessionTitle: {fontSize: 15, fontWeight: '700', color: c.text},
    lastSessionMeta: {fontSize: 13, color: c.textMuted, marginTop: 2},
    lastSessionBadge: {alignItems: 'center', marginLeft: 12},
    lastSessionBadgeNum: {
      fontSize: 28,
      fontWeight: '800',
      color: c.primary,
      lineHeight: 32,
    },
    lastSessionBadgeLbl: {
      fontSize: 11,
      color: c.textMuted,
      textTransform: 'uppercase',
    },
    expandBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    expandBtnText: {fontSize: 14, color: c.primary, fontWeight: '600'},
    chevron: {fontSize: 12, color: c.textMuted},
    // Attendees
    attendeeList: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 8,
    },
    attendeeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    attendeeName: {fontSize: 14, color: c.text, flex: 1},
    attendeeRight: {flexDirection: 'row', alignItems: 'center', gap: 6},
    attendeeCredits: {fontSize: 12, color: c.textMuted},
    typeBadge: {paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5},
    typeBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#374151',
      textTransform: 'uppercase',
    },
    // Date range
    presetRow: {flexDirection: 'row', gap: 6, marginBottom: 12},
    presetBtn: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: c.surfaceRaised,
      alignItems: 'center',
    },
    presetBtnText: {fontSize: 11, fontWeight: '600', color: c.text},
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    dateField: {flex: 1},
    dateLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textMuted,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    dateInput: {
      backgroundColor: c.surfaceRaised,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      color: c.text,
    },
    dateDivider: {width: 1, height: 36, backgroundColor: c.border},
    runBtn: {
      backgroundColor: '#34C759',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    runBtnDisabled: {backgroundColor: '#A3D9B1'},
    runBtnText: {color: '#FFFFFF', fontSize: 15, fontWeight: '700'},
    // Errors
    errorBox: {
      backgroundColor: '#FEE2E2',
      borderRadius: 10,
      padding: 14,
      marginBottom: 14,
    },
    errorText: {color: '#DC2626', fontSize: 14},
    // Summary grid
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 14,
    },
    summaryCard: {
      width: '47%',
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
    summaryValue: {fontSize: 28, fontWeight: '700', color: c.text},
    summaryLabel: {
      fontSize: 11,
      color: c.textMuted,
      marginTop: 4,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    summaryPrimaryCard: {
      backgroundColor: c.primary,
      borderRadius: 12,
      padding: 20,
      alignItems: 'center',
      marginBottom: 10,
      shadowColor: c.primary,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.18,
      shadowRadius: 4,
      elevation: 3,
    },
    summaryPrimaryValue: {
      fontSize: 40,
      fontWeight: '800',
      color: '#FFFFFF',
      lineHeight: 44,
    },
    summaryPrimaryLabel: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.85)',
      marginTop: 4,
      textTransform: 'uppercase',
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    // Session cards
    sessionCard: {
      borderRadius: 10,
      backgroundColor: c.surfaceRaised,
      marginBottom: 8,
      overflow: 'hidden',
    },
    sessionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
    },
    sessionHeaderLeft: {flex: 1, marginRight: 8},
    sessionLabel: {fontSize: 14, fontWeight: '700', color: c.text},
    sessionMeta: {fontSize: 12, color: c.textMuted, marginTop: 1},
    sessionHeaderRight: {alignItems: 'center'},
    sessionCount: {
      fontSize: 22,
      fontWeight: '800',
      color: c.primary,
      lineHeight: 26,
    },
    sessionCountLabel: {
      fontSize: 10,
      color: c.textMuted,
      textTransform: 'uppercase',
    },
    emptyText: {fontSize: 14, color: c.textMuted, paddingVertical: 6},
    exportPdfBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 14,
    },
    exportPdfBtnDisabled: {backgroundColor: '#A0C4FF'},
    exportPdfBtnText: {color: '#FFF', fontSize: 15, fontWeight: '700'},
  });
}
