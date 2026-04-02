import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {AttendanceHistoryItem} from '../types';
import {attendanceService} from '../services/attendanceService';

type Props = {
  navigation: any;
  route: {
    params: {
      membershipId: string;
      title?: string;
    };
  };
};

function formatCheckedInAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSessionStartTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function HistoryRow({item}: {item: AttendanceHistoryItem}) {
  return (
    <View style={styles.row}>
      <Text style={styles.sessionTitle}>{item.sessionTitle}</Text>
      <Text style={styles.checkedInAt}>
        Checked in · {formatCheckedInAt(item.checkedInAt)}
      </Text>
      <Text style={styles.secondary}>
        {formatSessionStartTime(item.sessionStartTime)}
      </Text>
      {item.locationName ? (
        <Text style={styles.secondary}>{item.locationName}</Text>
      ) : null}
    </View>
  );
}

export default function AttendanceHistoryScreen({navigation, route}: Props) {
  const {membershipId, title} = route.params;
  const [history, setHistory] = useState<AttendanceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (title) {
      navigation.setOptions({title});
    }
  }, [navigation, title]);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await attendanceService.getAttendanceHistoryForMembership(
      membershipId,
    );
    setHistory(data);
    setLoading(false);
  }, [membershipId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Check-ins</Text>
        <Text style={styles.summaryValue}>{history.length}</Text>
      </View>

      {/* List */}
      <FlatList
        data={history}
        keyExtractor={item => item.attendanceId}
        renderItem={({item}) => <HistoryRow item={item} />}
        contentContainerStyle={
          history.length === 0 ? styles.emptyContainer : styles.listContent
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No attendance history yet</Text>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},

  summaryCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryLabel: {fontSize: 14, color: '#8E8E93'},
  summaryValue: {fontSize: 22, fontWeight: 'bold', color: '#1C1C1E'},

  listContent: {paddingHorizontal: 16, paddingBottom: 32},
  emptyContainer: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  emptyText: {fontSize: 15, color: '#8E8E93', marginTop: 40},

  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  checkedInAt: {
    fontSize: 13,
    color: '#007AFF',
    marginBottom: 2,
  },
  secondary: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 1,
  },
  separator: {height: 0}, // spacing handled by marginBottom on row
});
