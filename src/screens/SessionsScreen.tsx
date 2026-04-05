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

type Props = {navigation: any};

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_VISIBLE_SESSIONS = 50;

export default function SessionsScreen({navigation}: Props) {
  const {currentMembership, currentClub} = useApp();
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
        <ActivityIndicator style={styles.loader} color="#007AFF" />
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
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
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
    color: '#1C1C1E',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#6B7280',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
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
    color: '#8E8E93',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#E5E7EB',
    marginHorizontal: 12,
  },
  highlightCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  highlightEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  highlightTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 6,
  },
  highlightSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  highlightTime: {
    marginTop: 8,
    fontSize: 13,
    color: '#3A3A3C',
    fontWeight: '600',
  },
  topActionCard: {
    backgroundColor: '#FFFFFF',
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
    color: '#1C1C1E',
  },
  topActionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  topActionArrow: {
    fontSize: 24,
    lineHeight: 24,
    color: '#C7C7CC',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
    marginLeft: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
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
    color: '#1C1C1E',
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
    color: '#3A3A3C',
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
    color: '#1C1C1E',
  },
  emptyText: {
    textAlign: 'center',
    color: '#8E8E93',
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
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#007AFF',
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
