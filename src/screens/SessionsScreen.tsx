import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../context/AppContext';
import {getSessions, ApiSession} from '../services/api/sessionApi';
import {formatDate} from '../utils/date';
import {CLUB_PRO_CONFIG} from '../config/appConfig';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';

type Props = {navigation: any};

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_VISIBLE_SESSIONS = 50;
// Past sessions older than this window are shown as locked (Pro required)
const LOCKED_PAST_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function SessionsScreen({navigation}: Props) {
  const {currentMembership, currentClub} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    const clubId = currentClub?.id;
    if (!clubId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getSessions(clubId);
      setSessions(data);
      console.log('📡 sessions loaded:', data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [currentClub]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadSessions);
    return unsub;
  }, [navigation, loadSessions]);

  const visibleSessions = useMemo(() => {
    const now = Date.now();

    return sessions
      .filter(session => {
        const startMs = new Date(session.startTime).getTime();
        const endMs = new Date(session.endTime).getTime();
        return startMs <= now + FOURTEEN_DAYS_MS && endMs >= now;
      })
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      )
      .slice(0, MAX_VISIBLE_SESSIONS);
  }, [sessions]);

  // Past sessions shown as locked Pro items
  const lockedSessions = useMemo(() => {
    if (CLUB_PRO_CONFIG.IS_PRO) return [];
    const now = Date.now();
    return sessions
      .filter(session => {
        const endMs = new Date(session.endTime).getTime();
        return endMs < now && endMs >= now - LOCKED_PAST_DAYS_MS;
      })
      .sort(
        (a, b) =>
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
      );
  }, [sessions]);

  const highlightedSession = useMemo(() => {
    const now = Date.now();

    const liveSession = visibleSessions.find(session => {
      const start = new Date(session.startTime).getTime();
      const end = new Date(session.endTime).getTime();
      return now >= start && now <= end;
    });

    if (liveSession) {
      return {
        type: 'live' as const,
        session: liveSession,
        title: 'Happening Now',
        subtitle: 'This session is currently open for check-in',
        accent: '#34C759',
      };
    }

    const nextSession = visibleSessions.find(
      session => new Date(session.startTime).getTime() > now,
    );

    if (nextSession) {
      return {
        type: 'upcoming' as const,
        session: nextSession,
        title: 'Next Session',
        subtitle: 'Your next upcoming session',
        accent: '#007AFF',
      };
    }

    return null;
  }, [visibleSessions]);

  const getRoleLabel = () => {
    const role = currentMembership?.role;

    switch (role) {
      case 'owner':
        return 'Owner';
      case 'admin':
        return 'Admin';
      case 'host':
        return 'Host';
      case 'member':
      default:
        return 'Member';
    }
  };

  const getStatusBadge = (session: ApiSession) => {
    const now = Date.now();
    const start = new Date(session.startTime).getTime();
    const end = new Date(session.endTime).getTime();

    if (now < start) {
      const diffHours = (start - now) / 3600000;

      if (diffHours <= 2) {
        return {
          label: 'Open for Check-In',
          textColor: '#1D4ED8',
          backgroundColor: '#DBEAFE',
        };
      }

      return {
        label: 'Upcoming',
        textColor: '#4B5563',
        backgroundColor: '#E5E7EB',
      };
    }

    if (now <= end) {
      return {
        label: 'Open for Check-In',
        textColor: '#1D4ED8',
        backgroundColor: '#DBEAFE',
      };
    }

    return {
      label: 'Ended',
      textColor: '#6B7280',
      backgroundColor: '#F3F4F6',
    };
  };

  const renderItem = ({item}: {item: ApiSession}) => {
    const badge = getStatusBadge(item);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate('SessionDetail', {sessionId: item.id})
        }>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>
            {item.title ?? item.locationName ?? 'Session'}
          </Text>
          {badge && (
            <View
              style={[
                styles.badgePill,
                {backgroundColor: badge.backgroundColor},
              ]}>
              <Text style={[styles.badgeText, {color: badge.textColor}]}>
                {badge.label}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.detailText}>⏱ {formatDate(item.startTime)}</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadSessions} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={styles.headerTitle}>Club Schedule</Text>
        <Text style={styles.headerSubtitle}>
          Upcoming sessions and recent activity
        </Text>
      </View>

      <FlatList
        data={visibleSessions}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Credits</Text>
                <Text style={styles.summaryValue}>
                  {currentMembership?.credits ?? 0}
                </Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Role</Text>
                <Text style={styles.summaryValue}>{getRoleLabel()}</Text>
              </View>
            </View>

            {highlightedSession && (
              <TouchableOpacity
                style={[
                  styles.highlightCard,
                  {borderLeftColor: highlightedSession.accent},
                ]}
                onPress={() =>
                  navigation.navigate('SessionDetail', {
                    sessionId: highlightedSession.session.id,
                  })
                }>
                <Text style={styles.highlightEyebrow}>
                  {highlightedSession.title}
                </Text>
                <Text style={styles.highlightTitle}>
                  {highlightedSession.session.title ??
                    highlightedSession.session.locationName ??
                    'Session'}
                </Text>
                <Text style={styles.highlightSubtitle}>
                  {highlightedSession.subtitle}
                </Text>
                <Text style={styles.highlightTime}>
                  {formatDate(highlightedSession.session.startTime)}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.topActionCard}
              onPress={() => navigation.navigate('BackfillSessions')}>
              <View style={styles.topActionTextWrap}>
                <Text style={styles.topActionTitle}>Past Sessions</Text>
                <Text style={styles.topActionSubtitle}>
                  View recently ended sessions and backfill availability
                </Text>
              </View>
              <Text style={styles.topActionArrow}>›</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Sessions</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No sessions found</Text>
            <Text style={styles.emptyText}>
              Upcoming and recent sessions will appear here.
            </Text>
          </View>
        }
        ListFooterComponent={
          lockedSessions.length > 0 ? (
            <View style={styles.lockedSection}>
              <Text style={styles.sectionTitle}>Past Sessions</Text>
              {lockedSessions.map(session => (
                <TouchableOpacity
                  key={session.id}
                  style={[styles.card, styles.cardLocked]}
                  onPress={() => navigation.navigate('ClubProPreview')}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, styles.cardTitleLocked]}>
                      {'\uD83D\uDD12 '}
                      {session.title ?? session.locationName ?? 'Session'}
                    </Text>
                    <View
                      style={[styles.badgePill, {backgroundColor: '#F3F4F6'}]}>
                      <Text style={[styles.badgeText, {color: '#8E8E93'}]}>
                        Pro
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.detailText, {color: '#B0B0B8'}]}>
                    {'\u23F1 '}
                    {formatDate(session.startTime)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: c.background},
    loader: {
      marginTop: 60,
    },
    headerBlock: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 10,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: c.text,
    },
    headerSubtitle: {
      marginTop: 4,
      fontSize: 14,
      color: c.textMuted,
    },
    listContent: {
      padding: 16,
      paddingTop: 8,
      paddingBottom: 40,
    },
    summaryCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 18,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
    },
    summaryItem: {
      flex: 1,
    },
    summaryLabel: {
      fontSize: 12,
      color: c.textMuted,
      marginBottom: 4,
    },
    summaryValue: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    summaryDivider: {
      width: 1,
      alignSelf: 'stretch',
      backgroundColor: c.border,
      marginHorizontal: 12,
    },
    highlightCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderLeftWidth: 4,
    },
    highlightEyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
    },
    highlightTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
      marginTop: 6,
    },
    highlightSubtitle: {
      marginTop: 4,
      fontSize: 13,
      color: c.textMuted,
      lineHeight: 18,
    },
    highlightTime: {
      marginTop: 8,
      fontSize: 13,
      color: c.text,
      fontWeight: '600',
    },
    topActionCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    topActionTextWrap: {
      flex: 1,
      paddingRight: 12,
    },
    topActionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
    },
    topActionSubtitle: {
      marginTop: 4,
      fontSize: 13,
      color: c.textMuted,
      lineHeight: 18,
    },
    topActionArrow: {
      fontSize: 24,
      lineHeight: 24,
      color: c.textMuted,
      fontWeight: '600',
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
      marginBottom: 12,
      marginLeft: 2,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: c.text,
      flex: 1,
      marginRight: 8,
    },
    badgePill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    detailText: {
      fontSize: 14,
      color: c.text,
      marginTop: 3,
    },
    emptyWrap: {
      marginTop: 48,
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    emptyText: {
      textAlign: 'center',
      color: c.textMuted,
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
    },
    errorWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    errorText: {
      fontSize: 15,
      color: c.danger,
      textAlign: 'center',
      marginBottom: 16,
    },
    retryButton: {
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.primary,
    },
    retryText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    lockedSection: {
      marginTop: 8,
    },
    cardLocked: {
      opacity: 0.6,
      backgroundColor: c.surfaceRaised,
    },
    cardTitleLocked: {
      color: c.textMuted,
    },
  });
}
