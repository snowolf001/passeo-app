import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../context/AppContext';
import {getSessions, ApiSession} from '../services/api/sessionApi';
import {getMemberAttendance} from '../services/api/attendanceApi';
import {formatDate} from '../utils/date';

type Props = {navigation: any};

export default function HomeScreen({navigation}: Props) {
  const {currentMembership, currentClub} = useApp();
  const [nextSession, setNextSession] = useState<ApiSession | null>(null);
  const [isTodayCheckedIn, setIsTodayCheckedIn] = useState(false);
  const [hasTodaySession, setHasTodaySession] = useState(false);
  const [loading, setLoading] = useState(true);

  const ROLE_LABELS: Record<string, string> = {
    member: 'Member',
    host: 'Host',
    admin: 'Admin',
    owner: 'Owner',
  };

  const loadData = useCallback(async () => {
    console.log(
      '[HomeScreen] loadData — currentMembership:',
      currentMembership?.id ?? 'null',
      'currentClub:',
      currentClub?.id ?? 'null',
    );
    if (!currentMembership) {
      console.log('[HomeScreen] loadData skipped — no currentMembership');
      return;
    }
    setLoading(true);

    const rawSessions = await getSessions(currentMembership.clubId);
    const sessions = rawSessions.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const upcoming = sessions.filter(s => new Date(s.startTime) >= now);
    setNextSession(upcoming[0] ?? null);

    const todaySession = sessions.find(s => {
      const st = new Date(s.startTime);
      return st >= todayStart && st <= todayEnd;
    });

    if (todaySession) {
      setHasTodaySession(true);
      try {
        const attendance = await getMemberAttendance(currentMembership.id);
        setIsTodayCheckedIn(
          attendance.some(a => a.sessionId === todaySession.id),
        );
      } catch {
        setIsTodayCheckedIn(false);
      }
    } else {
      setHasTodaySession(false);
      setIsTodayCheckedIn(false);
    }

    setLoading(false);
  }, [currentMembership]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadData);
    return unsub;
  }, [navigation, loadData]);

  console.log(
    '[HomeScreen] render — currentMembership:',
    currentMembership?.id ?? 'null',
    'currentClub:',
    currentClub?.id ?? 'null',
    'loading:',
    loading,
  );
  if (!currentMembership || !currentClub) {
    console.log('[HomeScreen] showing spinner — waiting for AppContext data');
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{marginTop: 60}} color="#007AFF" />
      </SafeAreaView>
    );
  }

  const role = currentMembership.role;
  const canCreateSession = ['host', 'admin', 'owner'].includes(role);

  const todayStatusCard = () => {
    if (loading) return null;
    if (isTodayCheckedIn) {
      return (
        <View style={[styles.statusCard, styles.statusCheckedIn]}>
          <Text style={styles.statusIcon}>✅</Text>
          <View>
            <Text style={styles.statusTitle}>Checked In Today</Text>
            <Text style={styles.statusSub}>You're good to go!</Text>
          </View>
        </View>
      );
    }
    if (hasTodaySession) {
      return (
        <View style={[styles.statusCard, styles.statusAvailable]}>
          <Text style={styles.statusIcon}>🏃</Text>
          <View>
            <Text style={styles.statusTitle}>Session Available</Text>
            <Text style={styles.statusSub}>You haven't checked in yet.</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.statusCard, styles.statusNone]}>
        <Text style={styles.statusIcon}>📆</Text>
        <View>
          <Text style={styles.statusTitle}>No Session Today</Text>
          <Text style={styles.statusSub}>
            Check the schedule for upcoming sessions.
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.clubName}>{currentClub.name}</Text>
          <Text style={styles.greeting}>
            Welcome back, {currentMembership.userName ?? 'there'}
          </Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{currentMembership.credits}</Text>
            <Text style={styles.statLabel}>Credits</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{ROLE_LABELS[role] ?? role}</Text>
            <Text style={styles.statLabel}>Role</Text>
          </View>
        </View>

        {/* Today status */}
        {todayStatusCard()}

        {/* Next session */}
        {nextSession && (
          <TouchableOpacity
            style={styles.nextSessionCard}
            onPress={() =>
              navigation.navigate('SessionDetail', {sessionId: nextSession.id})
            }>
            <Text style={styles.nextSessionLabel}>Next Session</Text>
            <Text style={styles.nextSessionTitle}>{nextSession.title}</Text>
            <Text style={styles.nextSessionDetail}>
              ⏱ {formatDate(nextSession.startTime)}
            </Text>
          </TouchableOpacity>
        )}

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Schedule' as any)}>
            <Text style={styles.actionIcon}>📅</Text>
            <Text style={styles.actionLabel}>View Schedule</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Profile' as any)}>
            <Text style={styles.actionIcon}>👤</Text>
            <Text style={styles.actionLabel}>My Profile</Text>
          </TouchableOpacity>
          {canCreateSession && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('CreateSession')}>
              <Text style={styles.actionIcon}>➕</Text>
              <Text style={styles.actionLabel}>New Session</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  scroll: {padding: 20, paddingBottom: 40},
  header: {marginBottom: 24},
  clubName: {fontSize: 28, fontWeight: 'bold', color: '#1C1C1E'},
  greeting: {fontSize: 15, color: '#8E8E93', marginTop: 4},
  statsRow: {flexDirection: 'row', gap: 12, marginBottom: 20},
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {fontSize: 26, fontWeight: 'bold', color: '#1C1C1E'},
  statLabel: {fontSize: 13, color: '#8E8E93', marginTop: 4},
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  statusCheckedIn: {backgroundColor: '#D1FAE5'},
  statusAvailable: {backgroundColor: '#DBEAFE'},
  statusNone: {backgroundColor: '#F3F4F6'},
  statusIcon: {fontSize: 28},
  statusTitle: {fontSize: 15, fontWeight: '700', color: '#1C1C1E'},
  statusSub: {fontSize: 13, color: '#6B7280', marginTop: 2},
  nextSessionCard: {
    backgroundColor: '#007AFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  nextSessionLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  nextSessionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  nextSessionDetail: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 14,
  },
  actionsRow: {flexDirection: 'row', gap: 12, flexWrap: 'wrap'},
  actionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    minWidth: 100,
    flex: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  actionIcon: {fontSize: 26, marginBottom: 6},
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3A3A3C',
    textAlign: 'center',
  },
});
