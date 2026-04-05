import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  getMyAttendance,
  ApiAttendanceItem,
} from '../services/api/attendanceApi';
import {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceHistory'>;

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

function formatLastCheckIn(iso?: string): string {
  if (!iso) {
    return '—';
  }

  const d = new Date(iso);
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();

  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  );
}

function HistoryRow({item}: {item: ApiAttendanceItem}) {
  return (
    <View style={styles.row}>
      <Text style={styles.sessionTitle}>{item.sessionTitle}</Text>

      <Text style={styles.checkedInAt}>
        Checked in · {formatCheckedInAt(item.checkedInAt)}
      </Text>

      <Text style={styles.secondary}>
        Session · {formatSessionStartTime(item.sessionStartTime)}
      </Text>

      {item.creditsUsed > 0 && (
        <Text style={styles.creditsUsed}>
          {item.creditsUsed} credit{item.creditsUsed !== 1 ? 's' : ''} used
        </Text>
      )}
    </View>
  );
}

export default function AttendanceHistoryScreen({navigation, route}: Props) {
  const {membershipId, title} = route.params;

  const [history, setHistory] = useState<ApiAttendanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (title) {
      navigation.setOptions({title});
    }
  }, [navigation, title]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getMyAttendance();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[AttendanceHistoryScreen] load failed:', err);
      setHistory([]);
      setError('Failed to load attendance history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalCheckIns = history.length;

  const thisMonthCount = useMemo(
    () => history.filter(item => isThisMonth(item.checkedInAt)).length,
    [history],
  );

  const lastCheckIn = useMemo(
    () => formatLastCheckIn(history[0]?.checkedInAt),
    [history],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total</Text>
          <Text style={styles.summaryValue}>{totalCheckIns}</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>This Month</Text>
          <Text style={styles.summaryValue}>{thisMonthCount}</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Last Check-In</Text>
          <Text style={styles.summaryValueSmall}>{lastCheckIn}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : history.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No attendance history yet</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={item => item.attendanceId}
          renderItem={({item}) => <HistoryRow item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},

  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 10,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 6,
    fontWeight: '600',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  summaryValueSmall: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#8E8E93',
  },
  errorText: {
    fontSize: 15,
    color: '#FF3B30',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },

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
    marginBottom: 4,
  },
  creditsUsed: {
    fontSize: 12,
    color: '#FF9500',
    fontWeight: '600',
    marginTop: 2,
  },
  secondary: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 1,
  },
  secondaryMuted: {
    fontSize: 12,
    color: '#AEAEB2',
    marginTop: 2,
  },
});
