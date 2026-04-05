import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../context/AppContext';
import {getAuditLogs, AuditLogItem} from '../services/api/reportApi';
import {formatDate} from '../utils/date';

const PAGE_SIZE = 50;

export default function AuditLogScreen() {
  const {currentClub} = useApp();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (!currentClub) {
        return;
      }
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const items = await getAuditLogs({
          clubId: currentClub.id,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        if (append) {
          setLogs(prev => [...prev, ...items]);
        } else {
          setLogs(items);
        }
        setHasMore(items.length === PAGE_SIZE);
        setOffset(nextOffset + items.length);
      } catch (err) {
        console.warn('[AuditLogScreen] load failed:', err);
        setError('Failed to load audit logs.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [currentClub],
  );

  useEffect(() => {
    load(0, false);
  }, [load]);

  const renderItem = ({item}: {item: AuditLogItem}) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.action}>{item.action}</Text>
        <Text style={styles.time}>{formatDate(item.createdAt)}</Text>
      </View>
      <Text style={styles.actor}>{item.actorName ?? item.actorUserId}</Text>
      {item.targetUserName && (
        <Text style={styles.target}>→ {item.targetUserName}</Text>
      )}
      {item.entityType && (
        <Text style={styles.entity}>
          {item.entityType}
          {item.entityId ? ` · ${item.entityId.slice(0, 8)}…` : ''}
        </Text>
      )}
      {Object.keys(item.metadata).length > 0 && (
        <Text style={styles.meta} numberOfLines={2}>
          {JSON.stringify(item.metadata)}
        </Text>
      )}
    </View>
  );

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
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => load(0, false)}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={logs}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No audit log entries yet.</Text>
          </View>
        }
        ListFooterComponent={
          hasMore && !loading ? (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={() => load(offset, true)}
              disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator color="#007AFF" />
              ) : (
                <Text style={styles.loadMoreText}>Load More</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 200,
  },
  errorText: {fontSize: 15, color: '#FF3B30', marginBottom: 12},
  emptyText: {fontSize: 15, color: '#8E8E93'},
  retryBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryBtnText: {color: '#FFF', fontWeight: '700'},
  list: {padding: 12, paddingBottom: 40},
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  action: {
    fontSize: 13,
    fontWeight: '700',
    color: '#007AFF',
    flex: 1,
  },
  time: {fontSize: 11, color: '#8E8E93'},
  actor: {fontSize: 13, color: '#1C1C1E'},
  target: {fontSize: 12, color: '#6B7280', marginTop: 2},
  entity: {fontSize: 11, color: '#8E8E93', marginTop: 2},
  meta: {
    fontSize: 10,
    color: '#A0AEC0',
    fontFamily: 'monospace' as any,
    marginTop: 4,
  },
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadMoreText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
