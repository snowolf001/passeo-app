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
import {RootStackParamList} from '../navigation/types';
import {
  getMemberHistory,
  MemberHistoryResponse,
  MemberHistoryItem,
} from '../services/api/reportApi';
import {formatDate} from '../utils/date';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'MemberHistory'>;

const CHECK_IN_TYPE_COLORS: Record<string, string> = {
  live: '#DCFCE7',
  backfill: '#FEF3C7',
  manual: '#DBEAFE',
};

export default function MemberHistoryScreen({route}: Props) {
  const {membershipId} = route.params;
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [data, setData] = useState<MemberHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getMemberHistory(membershipId);
      setData(result);
    } catch (err) {
      console.warn('[MemberHistoryScreen] load failed:', err);
      setError('Failed to load attendance history.');
    } finally {
      setLoading(false);
    }
  }, [membershipId]);

  useEffect(() => {
    load();
  }, [load]);

  const renderItem = ({item}: {item: MemberHistoryItem}) => {
    const bgColor = CHECK_IN_TYPE_COLORS[item.checkInType] ?? '#F3F4F6';
    const displayTitle = item.sessionTitle ?? item.locationName ?? 'Session';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sessionTitle}>{displayTitle}</Text>
          <View style={[styles.typeBadge, {backgroundColor: bgColor}]}>
            <Text style={styles.typeBadgeText}>{item.checkInType}</Text>
          </View>
        </View>

        {item.locationName && item.sessionTitle !== null && (
          <Text style={styles.locationText}>📍 {item.locationName}</Text>
        )}
        <Text style={styles.dateText}>{formatDate(item.sessionStartsAt)}</Text>

        <View style={styles.cardFooter}>
          <Text style={styles.footerText}>
            Participation: {item.creditsUsed}
          </Text>
          {item.checkedInByName && (
            <Text style={styles.footerText}>by {item.checkedInByName}</Text>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {data && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {data.summary.totalParticipation}
            </Text>
            <Text style={styles.summaryLabel}>Total Participation</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {data.summary.totalAttendances}
            </Text>
            <Text style={styles.summaryLabel}>Total Attendances</Text>
          </View>
        </View>
      )}

      <FlatList
        data={data?.items ?? []}
        keyExtractor={item => item.attendanceId}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No attendance history yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: c.background},
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      minHeight: 200,
    },
    errorText: {fontSize: 15, color: c.danger},
    emptyText: {fontSize: 15, color: c.textMuted},
    summaryBar: {
      flexDirection: 'row',
      backgroundColor: c.card,
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    summaryItem: {flex: 1, alignItems: 'center'},
    summaryDivider: {width: 1, backgroundColor: c.border, marginVertical: 4},
    summaryValue: {
      fontSize: 24,
      fontWeight: '700',
      color: c.text,
    },
    summaryLabel: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    list: {padding: 16, paddingBottom: 40},
    card: {
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 2,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sessionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
      flex: 1,
      marginRight: 8,
    },
    typeBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
    },
    typeBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#374151',
      textTransform: 'uppercase',
    },
    locationText: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 4,
    },
    dateText: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 2,
    },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    footerText: {
      fontSize: 12,
      color: c.textMuted,
    },
  });
}
