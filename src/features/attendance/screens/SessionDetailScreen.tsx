import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import {Session, Attendance, User} from '../models/types';
import {AttendanceService} from '../services/attendanceService';

interface SessionDetailScreenProps {
  route: {params: {sessionId: string}};
  navigation: any;
}

type AttendanceRow = {
  attendance: Attendance;
  user?: User;
};

const SessionDetailScreen: React.FC<SessionDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const {sessionId} = route.params;

  const [session, setSession] = useState<Session | null>(null);
  const [attendees, setAttendees] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    const loadedSession = AttendanceService.getSessionById(sessionId);
    if (loadedSession) {
      setSession(loadedSession);

      const attendances = AttendanceService.getAttendanceForSession(sessionId);

      // Sort by check-in time descending (newest first)
      const sortedAttendances = attendances.sort(
        (a, b) =>
          new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
      );

      const rows: AttendanceRow[] = sortedAttendances.map(att => ({
        attendance: att,
        user: AttendanceService.getUserById(att.userId),
      }));

      setAttendees(rows);
    } else {
      setSession(null);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    // Load initially
    loadData();

    // Reload when screen focuses to get fresh check-ins after coming back from ManualCheckInScreen
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });

    return unsubscribe;
  }, [navigation, loadData]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Session not found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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

  const formatTimeOnly = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  };

  const renderAttendee = ({item}: {item: AttendanceRow}) => (
    <View style={styles.attendeeCard}>
      <View style={styles.attendeeInfo}>
        <Text style={styles.attendeeName}>
          {item.user?.name || 'Unknown User'}
        </Text>
        <Text style={styles.attendeeMethod}>
          Method: {item.attendance.method}
        </Text>
      </View>
      <Text style={styles.attendeeTime}>
        {formatTimeOnly(item.attendance.checkedInAt)}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{session.title}</Text>
        <Text style={styles.detailText}>⏱ {formatDate(session.startsAt)}</Text>
        {session.location && (
          <Text style={styles.detailText}>📍 {session.location}</Text>
        )}
        {session.capacity !== undefined && (
          <Text style={styles.detailText}>
            👥 Capacity: {attendees.length} / {session.capacity}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.checkInButton}
        onPress={() =>
          navigation.navigate('ManualCheckIn', {sessionId: session.id})
        }>
        <Text style={styles.checkInButtonText}>Manual Check-In</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Checked In ({attendees.length})</Text>

      <FlatList
        data={attendees}
        keyExtractor={item => item.attendance.id}
        renderItem={renderAttendee}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No members checked in yet.</Text>
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    marginBottom: 16,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 16,
    color: '#3A3A3C',
    marginTop: 4,
  },
  checkInButton: {
    backgroundColor: '#34C759',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  checkInButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 10,
    color: '#1C1C1E',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  attendeeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  attendeeInfo: {
    flex: 1,
  },
  attendeeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  attendeeMethod: {
    fontSize: 12,
    color: '#8E8E93',
    textTransform: 'uppercase',
  },
  attendeeTime: {
    fontSize: 14,
    color: '#8E8E93',
  },
  emptyText: {
    textAlign: 'center',
    color: '#8E8E93',
    marginTop: 20,
    fontSize: 15,
  },
});

export default SessionDetailScreen;
