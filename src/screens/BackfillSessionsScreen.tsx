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
import {getMyAttendance} from '../services/api/attendanceApi';
import {attendanceService} from '../services/attendanceService';

type Props = {
  navigation: any;
};

const FALLBACK_SETTINGS = {
  allowMemberBackfill: true,
  memberBackfillHours: 24,
  hostBackfillHours: 72,
};

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_BACKFILL_SESSIONS = 50;

type SessionListItem = {
  session: any;
  mode:
    | 'live'
    | 'backfill'
    | 'expired'
    | 'already_checked_in'
    | 'no_credits'
    | 'not_allowed';
};

export default function BackfillSessionsScreen({navigation}: Props) {
  const {currentMembership, currentClub} = useApp();
  const [apiSessions, setApiSessions] = useState<ApiSession[]>([]);
  const [attendedSessionIds, setAttendedSessionIds] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);

  const clubSettings = currentClub?.settings ?? FALLBACK_SETTINGS;

  const loadSessions = useCallback(async () => {
    if (!currentMembership) return;
    setLoading(true);
    try {
      const [data, attendance] = await Promise.all([
        getSessions(currentMembership.clubId),
        getMyAttendance().catch(() => []),
      ]);
      setApiSessions(data);
      setAttendedSessionIds(new Set(attendance.map(a => a.sessionId)));
    } catch (err) {
      console.warn('[BackfillSessions] failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [currentMembership]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  if (!currentMembership || !currentClub) {
    return null;
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{marginTop: 60}} color="#007AFF" />
      </SafeAreaView>
    );
  }

  const filteredSessions = (() => {
    const now = Date.now();

    return apiSessions
      .map(session => {
        // Build a minimal shape attendanceService.getCheckInMode expects
        const sessionForMode = {
          ...session,
          startTime: session.startTime,
          endTime: session.endTime,
        };

        const mode = attendanceService.getCheckInMode({
          session: sessionForMode as any,
          membership: currentMembership,
          settings: clubSettings,
          isAlreadyCheckedIn: attendedSessionIds.has(session.id),
        });

        return {session, mode};
      })
      .filter(item => {
        if (!attendanceService.isSessionEnded(item.session as any)) {
          return false;
        }
        const startMs = new Date(item.session.startTime).getTime();
        return startMs >= now - FOURTEEN_DAYS_MS;
      })
      .sort(
        (a, b) =>
          new Date(b.session.startTime).getTime() -
          new Date(a.session.startTime).getTime(),
      )
      .slice(0, MAX_BACKFILL_SESSIONS);
  })();

  const getStatusLabel = (mode: SessionListItem['mode']) => {
    switch (mode) {
      case 'backfill':
        return 'Backfill Available';
      case 'expired':
        return 'Backfill Expired';
      case 'already_checked_in':
        return 'Checked In';
      case 'no_credits':
        return 'No Credits';
      case 'not_allowed':
        return 'Backfill Disabled';
      case 'live':
        return 'Available Now';
      default:
        return 'Unavailable';
    }
  };

  const getStatusColors = (mode: SessionListItem['mode']) => {
    switch (mode) {
      case 'backfill':
        return {
          text: '#166534',
          background: '#DCFCE7',
        };
      case 'already_checked_in':
        return {
          text: '#374151',
          background: '#E5E7EB',
        };
      case 'no_credits':
        return {
          text: '#9A3412',
          background: '#FFEDD5',
        };
      case 'expired':
      case 'not_allowed':
        return {
          text: '#991B1B',
          background: '#FEE2E2',
        };
      case 'live':
      default:
        return {
          text: '#374151',
          background: '#E5E7EB',
        };
    }
  };

  const getHelperText = (mode: SessionListItem['mode']) => {
    switch (mode) {
      case 'backfill':
        return 'You can still check in for this session';
      case 'already_checked_in':
        return 'You already checked in for this session';
      case 'expired':
        return 'This session is outside the backfill window';
      case 'no_credits':
        return 'You need at least 1 credit to backfill';
      case 'not_allowed':
        return 'Member backfill is disabled for this club';
      default:
        return null;
    }
  };

  const formatSessionTime = (startTime: string) => {
    return new Date(startTime).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const renderItem = ({item}: {item: SessionListItem}) => {
    const {session, mode} = item;
    const statusColors = getStatusColors(mode);
    const helperText = getHelperText(mode);
    const isClickable = mode === 'backfill' || mode === 'live';

    return (
      <TouchableOpacity
        style={[styles.card, !isClickable && styles.cardDisabled]}
        activeOpacity={isClickable ? 0.7 : 1}
        onPress={() => {
          if (!isClickable) {
            return;
          }

          navigation.navigate('SessionDetail', {
            sessionId: session.id,
          });
        }}>
        <View style={styles.row}>
          <Text style={styles.title}>
            {session.title ?? session.locationName ?? 'Session'}
          </Text>

          <View
            style={[
              styles.badgePill,
              {backgroundColor: statusColors.background},
            ]}>
            <Text style={[styles.badgeText, {color: statusColors.text}]}>
              {getStatusLabel(mode)}
            </Text>
          </View>
        </View>

        <Text style={styles.time}>{formatSessionTime(session.startTime)}</Text>

        {helperText ? (
          <Text style={styles.helperText}>{helperText}</Text>
        ) : null}

        {isClickable ? (
          <Text style={styles.actionHint}>Tap to check in</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={filteredSessions}
        keyExtractor={item => item.session.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerCard}>
            <Text style={styles.headerTitle}>Past Sessions</Text>
            <Text style={styles.headerSubtitle}>
              View recently ended sessions and see whether backfill is still
              available.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No recent past sessions</Text>
            <Text style={styles.emptyText}>
              Ended sessions from the last 14 days will appear here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  list: {
    padding: 16,
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
    paddingRight: 10,
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
  time: {
    marginTop: 8,
    fontSize: 13,
    color: '#8E8E93',
  },
  helperText: {
    marginTop: 8,
    fontSize: 13,
    color: '#6B7280',
  },
  actionHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#9CA3AF',
  },
  empty: {
    marginTop: 80,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  emptyText: {
    marginTop: 6,
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
