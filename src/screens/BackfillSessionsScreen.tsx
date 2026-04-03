import React, {useMemo} from 'react';
import {View, Text, FlatList, TouchableOpacity, StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../context/AppContext';
import {db} from '../data/mockData';
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

export default function BackfillSessionsScreen({navigation}: Props) {
  const {currentMembership, currentClub} = useApp();

  if (!currentMembership || !currentClub) {
    return null;
  }

  const sessions = db.getSessions();
  const attendances = db.getAttendances();
  const clubSettings = currentClub.settings ?? FALLBACK_SETTINGS;

  const filteredSessions = useMemo(() => {
    const now = Date.now();

    return sessions
      .map(session => {
        const isAlreadyCheckedIn = attendances.some(
          a =>
            a.sessionId === session.id &&
            a.membershipId === currentMembership.id,
        );

        const mode = attendanceService.getCheckInMode({
          session,
          membership: currentMembership,
          settings: clubSettings,
          isAlreadyCheckedIn,
        });

        return {
          session,
          mode,
        };
      })
      .filter(item => {
        if (!attendanceService.isSessionEnded(item.session)) {
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
  }, [sessions, attendances, currentMembership, clubSettings]);

  const renderItem = ({item}: any) => {
    const {session, mode} = item;

    const getStatusLabel = () => {
      switch (mode) {
        case 'backfill':
          return 'Backfill Available';
        case 'expired':
          return 'Expired';
        case 'already_checked_in':
          return 'Checked In';
        case 'no_credits':
          return 'No Credits';
        case 'not_allowed':
          return 'Not Allowed';
        case 'live':
          return 'Open for Check-In';
        default:
          return 'Missed';
      }
    };

    const getStatusColor = () => {
      switch (mode) {
        case 'backfill':
          return '#34C759';
        case 'already_checked_in':
          return '#8E8E93';
        case 'expired':
        case 'not_allowed':
          return '#FF3B30';
        case 'no_credits':
          return '#FF9500';
        default:
          return '#8E8E93';
      }
    };

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate('SessionDetail', {
            sessionId: session.id,
          })
        }>
        <View style={styles.row}>
          <Text style={styles.title}>{session.title}</Text>
          <Text style={[styles.badge, {color: getStatusColor()}]}>
            {getStatusLabel()}
          </Text>
        </View>

        <Text style={styles.time}>
          {new Date(session.startTime).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
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
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No recent past sessions</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  list: {padding: 16, paddingBottom: 40},
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
    paddingRight: 10,
  },
  badge: {
    fontSize: 13,
    fontWeight: '600',
  },
  time: {
    marginTop: 6,
    fontSize: 13,
    color: '#8E8E93',
  },
  empty: {
    marginTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
  },
});
