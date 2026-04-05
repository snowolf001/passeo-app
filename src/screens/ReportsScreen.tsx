import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useApp} from '../context/AppContext';
import {RootStackParamList} from '../navigation/types';
import {
  getSessionsBreakdown,
  SessionBreakdownItem,
  SessionsBreakdownResponse,
  SessionAttendeeItem,
} from '../services/api/reportApi';
import {formatDate} from '../utils/date';

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
  const {currentClub, currentMembership} = useApp();

  // ── Last session ──────────────────────────────────────────────────────────
  const [lastSession, setLastSession] = useState<SessionBreakdownItem | null>(
    null,
  );
  const [lastSessionLoading, setLastSessionLoading] = useState(true);
  const [lastSessionExpanded, setLastSessionExpanded] = useState(false);
  const [lastSessionError, setLastSessionError] = useState<string | null>(null);

  const isSessionLive = (session: SessionBreakdownItem | null): boolean => {
    if (!session) return false;
    const now = Date.now();
    const started = new Date(session.startsAt).getTime();
    const ended = session.endsAt ? new Date(session.endsAt).getTime() : null;
    return started <= now && (ended === null || ended > now);
  };

  // Full load — shows spinner, resets expanded
  const loadLastSession = useCallback(() => {
    if (!currentClub) {
      setLastSessionLoading(false);
      setLastSessionError('No club loaded');
      return;
    }
    setLastSessionLoading(true);
    setLastSessionError(null);
    setLastSessionExpanded(false);
    getSessionsBreakdown({clubId: currentClub.id, lastOnly: true})
      .then(data => setLastSession(data.sessions[0] ?? null))
      .catch(err => {
        setLastSessionError(err?.message ?? String(err));
        setLastSession(null);
      })
      .finally(() => setLastSessionLoading(false));
  }, [currentClub]);

  // Silent refresh — no spinner, keeps expanded state (used by auto-refresh)
  const silentRefreshLastSession = useCallback(() => {
    if (!currentClub) return;
    getSessionsBreakdown({clubId: currentClub.id, lastOnly: true})
      .then(data => setLastSession(data.sessions[0] ?? null))
      .catch(() => {});
  }, [currentClub]);

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
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set(),
  );

  // Initial load
  useEffect(() => {
    loadLastSession();
  }, [loadLastSession]);

  // Auto-refresh every 30s while the session is live
  useEffect(() => {
    if (!isSessionLive(lastSession)) return;
    const timer = setInterval(silentRefreshLastSession, 30000);
    return () => clearInterval(timer);
  }, [lastSession, silentRefreshLastSession]);

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
    setExpandedSessions(new Set());
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

  const renderAttendeeRow = (attendee: SessionAttendeeItem) => (
    <View key={attendee.attendanceId} style={styles.attendeeRow}>
      <Text style={styles.attendeeName}>{attendee.memberName}</Text>
      <View style={styles.attendeeRight}>
        <Text style={styles.attendeeCredits}>{attendee.creditsUsed} cr</Text>
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
            <Text style={styles.sessionCount}>{session.attendeeCount}</Text>
            <Text style={styles.sessionCountLabel}>members</Text>
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

  const role = currentMembership?.role ?? '';
  const canViewMemberHistory = ['host', 'admin', 'owner'].includes(role);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Quick links */}
        {canViewMemberHistory && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Links</Text>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => {
                if (currentMembership) {
                  navigation.navigate('MemberHistory', {
                    membershipId: currentMembership.id,
                    title: 'My Attendance',
                  });
                }
              }}>
              <Text style={styles.linkText}>My Attendance History</Text>
              <Text style={styles.chevronLg}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Current / Last Session ───────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, {marginBottom: 0}]}>
                {isSessionLive(lastSession)
                  ? 'Current Session'
                  : 'Last Session'}
              </Text>
              {isSessionLive(lastSession) && (
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={loadLastSession}
              disabled={lastSessionLoading}>
              <Text style={styles.refreshBtn}>↻ Refresh</Text>
            </TouchableOpacity>
          </View>
          {lastSessionLoading ? (
            <ActivityIndicator color="#007AFF" style={styles.centerPad} />
          ) : lastSessionError ? (
            <Text style={styles.errorText}>{lastSessionError}</Text>
          ) : !lastSession ? (
            <Text style={styles.emptyText}>No sessions found.</Text>
          ) : (
            <>
              <View style={styles.lastSessionRow}>
                <View style={{flex: 1}}>
                  <Text style={styles.lastSessionTitle}>
                    {lastSession.title ?? lastSession.locationName ?? 'Session'}
                  </Text>
                  {lastSession.locationName && lastSession.title && (
                    <Text style={styles.lastSessionMeta}>
                      {lastSession.locationName}
                    </Text>
                  )}
                  <Text style={styles.lastSessionMeta}>
                    {formatDate(lastSession.startsAt)}
                  </Text>
                </View>
                <View style={styles.lastSessionBadge}>
                  <Text style={styles.lastSessionBadgeNum}>
                    {lastSession.attendeeCount}
                  </Text>
                  <Text style={styles.lastSessionBadgeLbl}>attended</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.expandBtn}
                onPress={() => setLastSessionExpanded(v => !v)}>
                <Text style={styles.expandBtnText}>
                  {lastSessionExpanded ? 'Hide attendees' : 'Show attendees'}
                </Text>
                <Text style={styles.chevron}>
                  {lastSessionExpanded ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>
              {lastSessionExpanded && (
                <View style={styles.attendeeList}>
                  {lastSession.attendees.length === 0 ? (
                    <Text style={styles.emptyText}>No check-ins recorded.</Text>
                  ) : (
                    lastSession.attendees.map(renderAttendeeRow)
                  )}
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Sessions by Date Range ───────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sessions by Date Range</Text>
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
              <TextInput
                style={styles.dateInput}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                maxLength={10}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.dateDivider} />
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>To</Text>
              <TextInput
                style={styles.dateInput}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                maxLength={10}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          <TouchableOpacity
            style={[styles.runBtn, rangeLoading && styles.runBtnDisabled]}
            onPress={runRangeReport}
            disabled={rangeLoading}>
            {rangeLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.runBtnText}>Run Report</Text>
            )}
          </TouchableOpacity>
        </View>

        {rangeError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{rangeError}</Text>
          </View>
        )}

        {rangeData && (
          <>
            {/* Summary cards */}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {rangeData.summary.totalSessions}
                </Text>
                <Text style={styles.summaryLabel}>Sessions</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {rangeData.summary.totalUniqueMembers}
                </Text>
                <Text style={styles.summaryLabel}>Members</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {rangeData.summary.totalAttendances}
                </Text>
                <Text style={styles.summaryLabel}>Check-ins</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {rangeData.summary.totalCreditsUsed}
                </Text>
                <Text style={styles.summaryLabel}>Credits</Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  scroll: {padding: 16, paddingBottom: 40},
  centerPad: {paddingVertical: 16},
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
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
  refreshBtn: {fontSize: 13, color: '#007AFF', fontWeight: '600'}, // Quick links
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {fontSize: 15, color: '#1C1C1E'},
  chevronLg: {fontSize: 22, color: '#C7C7CC'},
  // Last session
  lastSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  lastSessionTitle: {fontSize: 15, fontWeight: '700', color: '#1C1C1E'},
  lastSessionMeta: {fontSize: 13, color: '#8E8E93', marginTop: 2},
  lastSessionBadge: {alignItems: 'center', marginLeft: 12},
  lastSessionBadgeNum: {
    fontSize: 28,
    fontWeight: '800',
    color: '#007AFF',
    lineHeight: 32,
  },
  lastSessionBadgeLbl: {
    fontSize: 11,
    color: '#8E8E93',
    textTransform: 'uppercase',
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  expandBtnText: {fontSize: 14, color: '#007AFF', fontWeight: '600'},
  chevron: {fontSize: 12, color: '#8E8E93'},
  // Attendees
  attendeeList: {
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    paddingTop: 8,
  },
  attendeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F9F9FB',
  },
  attendeeName: {fontSize: 14, color: '#1C1C1E', flex: 1},
  attendeeRight: {flexDirection: 'row', alignItems: 'center', gap: 6},
  attendeeCredits: {fontSize: 12, color: '#8E8E93'},
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
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
  },
  presetBtnText: {fontSize: 11, fontWeight: '600', color: '#3A3A3C'},
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
    color: '#8E8E93',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dateInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1C1C1E',
  },
  dateDivider: {width: 1, height: 36, backgroundColor: '#E5E5EA'},
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  summaryValue: {fontSize: 28, fontWeight: '700', color: '#1C1C1E'},
  summaryLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  // Session cards
  sessionCard: {
    borderRadius: 10,
    backgroundColor: '#F9F9FB',
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
  sessionLabel: {fontSize: 14, fontWeight: '700', color: '#1C1C1E'},
  sessionMeta: {fontSize: 12, color: '#8E8E93', marginTop: 1},
  sessionHeaderRight: {alignItems: 'center'},
  sessionCount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#007AFF',
    lineHeight: 26,
  },
  sessionCountLabel: {
    fontSize: 10,
    color: '#8E8E93',
    textTransform: 'uppercase',
  },
  emptyText: {fontSize: 14, color: '#8E8E93', paddingVertical: 6},
});
