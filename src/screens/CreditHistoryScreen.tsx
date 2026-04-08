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
  getMemberCreditTransactions,
  ApiCreditTransaction,
} from '../services/api/attendanceApi';
import {RootStackParamList} from '../navigation/types';
import {useApp} from '../context/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'CreditHistory'>;

type RangeFilter = '30D' | '90D' | '1Y' | 'ALL';

const FILTERS: RangeFilter[] = ['30D', '90D', '1Y', 'ALL'];

function getCutoffDate(filter: RangeFilter): Date | null {
  if (filter === 'ALL') return null;
  const now = new Date();
  const days = filter === '30D' ? 30 : filter === '90D' ? 90 : 365;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function applyRangeFilter(
  items: ApiCreditTransaction[],
  filter: RangeFilter,
): ApiCreditTransaction[] {
  const cutoff = getCutoffDate(filter);
  if (!cutoff) return items;
  return items.filter(item => {
    const d = new Date(item.createdAt);
    return !isNaN(d.getTime()) && d >= cutoff;
  });
}

function emptyLabel(filter: RangeFilter): string {
  if (filter === '30D') return 'No transactions in the last 30 days.';
  if (filter === '90D') return 'No transactions in the last 90 days.';
  if (filter === '1Y') return 'No transactions in the past year.';
  return 'No credit history yet.';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function TransactionRow({item}: {item: ApiCreditTransaction}) {
  const isCredit = item.amount > 0;

  // For 'add' type: title is the note (reason) or 'Credits Added'
  // For 'checkin' type: title is the session name
  const title = isCredit
    ? item.note ?? 'Credits Added'
    : item.sessionTitle ?? 'Check-In';

  const subtitle = isCredit ? `Added by ${item.actorName ?? 'Admin'}` : null;

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.typeIcon}>{isCredit ? '➕' : '➖'}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.typeLabel}>{title}</Text>
        {subtitle && <Text style={styles.secondary}>{subtitle}</Text>}
        <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
      </View>
      <Text
        style={[
          styles.amount,
          isCredit ? styles.amountPositive : styles.amountNegative,
        ]}>
        {isCredit ? '+' : ''}
        {item.amount}
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

export default function CreditHistoryScreen({}: Props) {
  const {currentMembership} = useApp();
  const [transactions, setTransactions] = useState<ApiCreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('30D');

  const loadTransactions = useCallback(async () => {
    if (!currentMembership) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getMemberCreditTransactions(currentMembership.id);
      setTransactions(data);
    } catch {
      setError('Failed to load credit history.');
    } finally {
      setLoading(false);
    }
  }, [currentMembership]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const filteredTransactions = useMemo(
    () => applyRangeFilter(transactions, rangeFilter),
    [transactions, rangeFilter],
  );

  const totalAdded = filteredTransactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalUsed = filteredTransactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  if (loading) {
    return (
      <SafeAreaView
        style={styles.container}
        edges={['bottom', 'left', 'right']}>
        <ActivityIndicator style={{marginTop: 60}} color="#007AFF" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView
        style={styles.container}
        edges={['bottom', 'left', 'right']}>
        <Text style={styles.errorText}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={filteredTransactions}
        keyExtractor={item => item.transactionId}
        renderItem={({item}) => <TransactionRow item={item} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <View style={styles.statsCard}>
              <View style={styles.statsItem}>
                <Text style={styles.statsLabel}>Balance</Text>
                <Text style={[styles.statsValue, styles.amountBlue]}>
                  {currentMembership?.credits ?? 0}
                </Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsLabel}>Added</Text>
                <Text style={[styles.statsValue, styles.amountPositive]}>
                  +{totalAdded}
                </Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsLabel}>Used</Text>
                <Text style={[styles.statsValue, styles.amountNegative]}>
                  {totalUsed}
                </Text>
              </View>
            </View>
            <FilterBar selected={rangeFilter} onSelect={setRangeFilter} />
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{emptyLabel(rangeFilter)}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 8,
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    marginBottom: 8,
  },
  statsItem: {
    flex: 1,
    alignItems: 'center',
  },
  statsDivider: {
    width: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 4,
  },
  statsLabel: {
    fontSize: 11,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  statsValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  amountBlue: {
    color: '#007AFF',
  },
  filterBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
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
    backgroundColor: '#007AFF',
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  filterBtnTextActive: {
    color: '#FFFFFF',
  },
  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowLeft: {
    marginRight: 10,
  },
  typeIcon: {
    fontSize: 20,
  },
  rowBody: {
    flex: 1,
  },
  typeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  secondary: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 1,
  },
  note: {
    fontSize: 12,
    color: '#AEAEB2',
    marginTop: 2,
  },
  date: {
    fontSize: 12,
    color: '#AEAEB2',
    marginTop: 3,
  },
  amount: {
    fontSize: 17,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },
  amountPositive: {
    color: '#34C759',
  },
  amountNegative: {
    color: '#FF3B30',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#8E8E93',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 60,
    color: '#FF3B30',
    fontSize: 15,
  },
});
