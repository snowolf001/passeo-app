import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  getMemberAttendance,
  ApiAttendanceItem,
} from '../services/api/attendanceApi';
import {RootStackParamList} from '../navigation/types';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceHistory'>;

type RangeFilter = '30D' | '90D' | '1Y' | 'ALL';

const FILTERS: RangeFilter[] = ['30D', '90D', '1Y', 'ALL'];

function getCutoffDate(filter: RangeFilter): Date | null {
  if (filter === 'ALL') return null;
  const now = new Date();
  const days = filter === '30D' ? 30 : filter === '90D' ? 90 : 365;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function applyRangeFilter(
  items: ApiAttendanceItem[],
  filter: RangeFilter,
): ApiAttendanceItem[] {
  const cutoff = getCutoffDate(filter);
  if (!cutoff) return items;
  return items.filter(item => {
    const d = new Date(item.checkedInAt);
    return !isNaN(d.getTime()) && d >= cutoff;
  });
}

function emptyLabel(filter: RangeFilter, hasAny: boolean): string {
  if (!hasAny) return 'No attendance history yet.';
  if (filter === '30D') return 'No check-ins in the last 30 days.';
  if (filter === '90D') return 'No check-ins in the last 90 days.';
  if (filter === '1Y') return 'No check-ins in the past year.';
  return 'No attendance history yet.';
}

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
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

      <Text style={styles.checkInMethod}>
        {item.checkInMethod === 'manual'
          ? '👤 Checked in by host'
          : '✋ Self check-in'}
      </Text>
    </View>
  );
}

function FilterBar({
  selected,
  onSelect,
}: {
  selected: RangeFilter;
  onSelect: (f: RangeFilter) => void;
}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.filterBar}>
      {FILTERS.map(f => (
        <TouchableOpacity
          key={f}
          onPress={() => onSelect(f)}
          style={[styles.filterBtn, selected === f && styles.filterBtnActive]}>
          <Text
            style={[
              styles.filterBtnText,
              selected === f && styles.filterBtnTextActive,
            ]}>
            {f}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function AttendanceHistoryScreen({navigation, route}: Props) {
  const {membershipId, title} = route.params;
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [history, setHistory] = useState<ApiAttendanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('30D');

  useEffect(() => {
    if (title) {
      navigation.setOptions({title});
    }
  }, [navigation, title]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getMemberAttendance(membershipId);
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

  const filteredHistory = useMemo(
    () => applyRangeFilter(history, rangeFilter),
    [history, rangeFilter],
  );

  const totalCheckIns = filteredHistory.length;

  const thisMonthCount = useMemo(
    () => filteredHistory.filter(item => isThisMonth(item.checkedInAt)).length,
    [filteredHistory],
  );

  const lastCheckIn = useMemo(
    () => formatLastCheckIn(filteredHistory[0]?.checkedInAt),
    [filteredHistory],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Sessions</Text>
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

      <FilterBar selected={rangeFilter} onSelect={setRangeFilter} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : filteredHistory.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {emptyLabel(rangeFilter, history.length > 0)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredHistory}
          keyExtractor={item => item.attendanceId}
          renderItem={({item}) => <HistoryRow item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: c.background},

    filterBar: {
      flexDirection: 'row',
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 4,
      marginHorizontal: 16,
      marginBottom: 8,
      gap: 4,
    },
    filterBtn: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 8,
      alignItems: 'center',
    },
    filterBtnActive: {
      backgroundColor: c.primary,
    },
    filterBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textMuted,
    },
    filterBtnTextActive: {
      color: '#FFFFFF',
    },

    summaryCard: {
      flexDirection: 'row',
      backgroundColor: c.card,
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
      backgroundColor: c.border,
      marginVertical: 4,
    },
    summaryLabel: {
      fontSize: 12,
      color: c.textMuted,
      marginBottom: 6,
      fontWeight: '600',
      textTransform: 'uppercase',
      textAlign: 'center',
    },
    summaryValue: {
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
      textAlign: 'center',
    },
    summaryValueSmall: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
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
      color: c.textMuted,
    },
    errorText: {
      fontSize: 15,
      color: c.danger,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: 15,
      color: c.textMuted,
      textAlign: 'center',
    },

    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },

    row: {
      backgroundColor: c.card,
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
      color: c.text,
      marginBottom: 4,
    },
    checkedInAt: {
      fontSize: 13,
      color: c.primary,
      marginBottom: 4,
    },
    creditsUsed: {
      fontSize: 12,
      color: '#FF9500',
      fontWeight: '600',
      marginTop: 2,
    },
    checkInMethod: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
    secondary: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 1,
    },
    secondaryMuted: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
  });
}
