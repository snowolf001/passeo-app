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
import {sessionService} from '../services/sessionService';
import {attendanceService} from '../services/attendanceService';
import {SessionWithLocation} from '../types';
import {formatDate} from '../utils/date';

type Props = {navigation: any};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_VISIBLE_SESSIONS = 50;

export default function SessionsScreen({navigation}: Props) {
  const {currentMembership} = useApp();
  const [sessions, setSessions] = useState<SessionWithLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    if (!currentMembership) return;
    setLoading(true);
    const data = await sessionService.getSessionsByClub(
      currentMembership.clubId,
    );
    setSessions(data);
    setLoading(false);
  }, [currentMembership]);

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
        const endMs = session.endTime
          ? new Date(session.endTime).getTime()
          : startMs;

        const withinUpcomingWindow = startMs <= now + FOURTEEN_DAYS_MS;
        const withinRecentPastWindow = endMs >= now - THREE_DAYS_MS;

        return withinUpcomingWindow && withinRecentPastWindow;
      })
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      )
      .slice(0, MAX_VISIBLE_SESSIONS);
  }, [sessions]);

  const getStatusBadge = (session: SessionWithLocation) => {
    if (!currentMembership) return null;

    const now = Date.now();
    const start = new Date(session.startTime).getTime();
    const end = new Date(session.endTime ?? session.startTime).getTime();

    const isCheckedIn = attendanceService.isCheckedIn(
      currentMembership.id,
      session.id,
    );

    if (isCheckedIn) {
      return {label: 'Checked In', color: '#34C759'};
    }

    if (now < start) {
      const diffHours = (start - now) / 3600000;

      if (diffHours <= 2) {
        return {label: 'Open for Check-In', color: '#007AFF'};
      }

      return {label: 'Upcoming', color: '#8E8E93'};
    }

    if (now <= end) {
      return {label: 'Open for Check-In', color: '#007AFF'};
    }

    return {label: 'Ended', color: '#8E8E93'};
  };

  const renderItem = ({item}: {item: SessionWithLocation}) => {
    const badge = getStatusBadge(item);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate('SessionDetail', {sessionId: item.id})
        }>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {badge && (
            <View style={[styles.badge, {backgroundColor: badge.color}]}>
              <Text style={styles.badgeText}>{badge.label}</Text>
            </View>
          )}
        </View>

        <Text style={styles.detailText}>⏱ {formatDate(item.startTime)}</Text>

        {item.location && (
          <>
            <Text style={styles.detailText}>📍 {item.location.name}</Text>
            <Text style={styles.addressText} numberOfLines={1}>
              {item.location.address}
            </Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{marginTop: 60}} color="#007AFF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.headerTitle}>Club Schedule</Text>
      <FlatList
        data={visibleSessions}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No sessions found.</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
    color: '#1C1C1E',
  },
  listContent: {padding: 16, paddingTop: 8},
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
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {color: '#FFF', fontSize: 11, fontWeight: '700'},
  detailText: {fontSize: 14, color: '#3A3A3C', marginTop: 3},
  addressText: {fontSize: 12, color: '#8E8E93', marginTop: 2},
  emptyText: {
    textAlign: 'center',
    color: '#8E8E93',
    marginTop: 40,
    fontSize: 16,
  },
});
