import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import {Session} from '../models/types';
import {AttendanceService} from '../services/attendanceService';

interface SessionsScreenProps {
  navigation: any;
}

const SessionsScreen: React.FC<SessionsScreenProps> = ({navigation}) => {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    const loadedSessions = AttendanceService.getSessions();
    setSessions(loadedSessions);
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderItem = ({item}: {item: Session}) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() =>
        navigation.navigate('SessionDetail', {sessionId: item.id})
      }>
      <View style={styles.cardHeader}>
        <Text style={styles.title}>{item.title}</Text>
      </View>
      <Text style={styles.detailText}>⏱ {formatDate(item.startsAt)}</Text>
      {item.location ? (
        <Text style={styles.detailText}>📍 {item.location}</Text>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.headerTitle}>Upcoming Sessions</Text>
      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No upcoming sessions available.</Text>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
    color: '#1C1C1E',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  detailText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#8E8E93',
    marginTop: 40,
    fontSize: 16,
  },
});

export default SessionsScreen;
