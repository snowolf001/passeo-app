import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../context/AppContext';
import {getAuditLogs, AuditLogItem} from '../services/api/reportApi';
import {getClubMembers, ApiClubMember} from '../services/api/clubApi';
import {formatDateTime} from '../utils/date';
import {exportAuditLogPdf} from '../services/auditLogPdfService';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';

const PAGE_SIZE = 50;

// Human-readable action labels
const ACTION_LABELS: Record<string, string> = {
  check_in_manual: 'Manual check-in',
  check_in_self: 'Self check-in',
  check_in_backfill: 'Backfill check-in',
  credits_added: 'Credits added',
  credits_deducted: 'Credits deducted',
  role_changed: 'Role changed',
  session_created: 'Session created',
  session_updated: 'Session updated',
  session_deleted: 'Session deleted',
  member_joined: 'Member joined',
  member_left: 'Member left',
};

const ACTION_COLORS: Record<string, string> = {
  check_in_manual: '#007AFF',
  check_in_self: '#34C759',
  check_in_backfill: '#5856D6',
  credits_added: '#34C759',
  credits_deducted: '#FF3B30',
  role_changed: '#FF9500',
  session_created: '#007AFF',
  session_updated: '#8E8E93',
  session_deleted: '#FF3B30',
  member_joined: '#34C759',
  member_left: '#8E8E93',
};

const EVENT_TYPE_OPTIONS: {label: string; value: string | null}[] = [
  {label: 'All Events', value: null},
  {label: 'Manual check-in', value: 'check_in_manual'},
  {label: 'Self check-in', value: 'check_in_self'},
  {label: 'Backfill check-in', value: 'check_in_backfill'},
  {label: 'Credits added', value: 'credits_added'},
  {label: 'Credits deducted', value: 'credits_deducted'},
];

function resolveActionKey(action: string, checkInType?: string): string {
  if (action === 'member_checked_in' || action === 'check_in') {
    if (checkInType === 'manual') return 'check_in_manual';
    if (checkInType === 'backfill') return 'check_in_backfill';
    return 'check_in_self';
  }
  if (action === 'check_in_backfill') return 'check_in_backfill';
  if (action === 'credits_removed') return 'credits_deducted';
  return action;
}

function formatDelta(amount: number): string {
  const abs = Math.abs(amount);
  const word = abs === 1 ? 'credit' : 'credits';
  return `${amount > 0 ? '+' : ''}${amount} ${word}`;
}

type Props = {navigation: any};

export default function AuditLogScreen({navigation}: Props) {
  const {currentClub, currentMembership} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Filter state
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [members, setMembers] = useState<ApiClubMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<ApiClubMember | null>(
    null,
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Event type filter
  const [eventTypePickerOpen, setEventTypePickerOpen] = useState(false);
  const [selectedEventType, setSelectedEventType] = useState<string | null>(
    null,
  );

  // Applied filters (used in load call)
  const [appliedMember, setAppliedMember] = useState<ApiClubMember | null>(
    null,
  );
  const [appliedStart, setAppliedStart] = useState('');
  const [appliedEnd, setAppliedEnd] = useState('');
  const [appliedEventType, setAppliedEventType] = useState<string | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  // List state
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Load members for picker
  useEffect(() => {
    if (!currentMembership) return;
    getClubMembers(currentMembership.clubId)
      .then(data =>
        setMembers(
          data
            .filter(m => m.active)
            .sort((a, b) => a.userName.localeCompare(b.userName)),
        ),
      )
      .catch(() => {});
  }, [currentMembership]);

  const load = useCallback(
    async (
      nextOffset: number,
      append: boolean,
      filters: {
        targetUserId?: string | null;
        startDate?: string;
        endDate?: string;
      },
    ) => {
      if (!currentClub) return;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const items = await getAuditLogs({
          clubId: currentClub.id,
          limit: PAGE_SIZE,
          offset: nextOffset,
          targetUserId: filters.targetUserId,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
        });
        if (append) setLogs(prev => [...prev, ...items]);
        else setLogs(items);
        setHasMore(items.length === PAGE_SIZE);
        setOffset(nextOffset + items.length);
      } catch {
        setError('Failed to load audit logs.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [currentClub],
  );

  // Initial load
  useEffect(() => {
    load(0, false, {});
  }, [load]);

  const applyFilters = () => {
    setAppliedMember(selectedMember);
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
    setAppliedEventType(selectedEventType);
    load(0, false, {
      targetUserId: selectedMember?.userId ?? null,
      startDate,
      endDate,
    });
  };

  const clearFilters = () => {
    setSelectedMember(null);
    setStartDate('');
    setEndDate('');
    setSelectedEventType(null);
    setAppliedMember(null);
    setAppliedStart('');
    setAppliedEnd('');
    setAppliedEventType(null);
    load(0, false, {});
  };

  const hasActiveFilters = !!(
    appliedMember ||
    appliedStart ||
    appliedEnd ||
    appliedEventType
  );

  // Client-side event type filter applied on top of server-filtered results
  const filteredLogs = appliedEventType
    ? logs.filter(item => {
        const checkInType = (item.metadata?.checkInType as string) ?? undefined;
        return resolveActionKey(item.action, checkInType) === appliedEventType;
      })
    : logs;

  const handleExportPdf = async () => {
    if (filteredLogs.length === 0) {
      Alert.alert('Nothing to export', 'No audit log entries to export.');
      return;
    }
    if (!currentClub) return;
    setExporting(true);
    try {
      const eventTypeLabel = EVENT_TYPE_OPTIONS.find(
        o => o.value === appliedEventType,
      )?.label;
      const outputPath = await exportAuditLogPdf(
        filteredLogs,
        currentClub.name,
        {
          memberName: appliedMember?.userName,
          eventTypeLabel,
          startDate: appliedStart || undefined,
          endDate: appliedEnd || undefined,
        },
      );
      if (outputPath) {
        navigation.navigate('PdfPreview', {
          url: `file://${outputPath}`,
          title: 'Audit Log',
          filename: outputPath.split('/').pop(),
        });
      }
    } catch (err: any) {
      Alert.alert('Export failed', err?.message ?? 'Could not export PDF.');
    } finally {
      setExporting(false);
    }
  };

  const renderItem = ({item}: {item: AuditLogItem}) => {
    const meta = item.metadata ?? {};
    const checkInType = meta.checkInType as string | undefined;
    const resolvedKey = resolveActionKey(item.action, checkInType);
    const label = ACTION_LABELS[resolvedKey] ?? item.action;
    const color = ACTION_COLORS[resolvedKey] ?? '#8E8E93';

    const isCheckIn =
      resolvedKey === 'check_in_manual' ||
      resolvedKey === 'check_in_self' ||
      resolvedKey === 'check_in_backfill';
    const isCreditsAdjust =
      resolvedKey === 'credits_added' || resolvedKey === 'credits_deducted';

    // Check-in fields
    const creditsUsed = meta.creditsUsed as number | undefined;
    const remainingCredits = meta.remainingCredits as number | undefined;
    const sessionTitle = meta.sessionTitle as string | undefined;
    const locationName = meta.locationName as string | undefined;
    const sessionDisplay = sessionTitle || locationName;

    // Credits adjustment fields
    const amount = meta.amount as number | undefined;
    const newCredits = meta.newCredits as number | undefined;

    return (
      <View style={styles.card}>
        {/* Top row: badge + time */}
        <View style={styles.cardHeader}>
          <View style={[styles.actionBadge, {backgroundColor: color + '18'}]}>
            <Text style={[styles.actionText, {color}]}>{label}</Text>
          </View>
          <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
        </View>

        {/* Credits adjustment card body */}
        {isCreditsAdjust ? (
          <>
            {item.actorName ? (
              <Text style={styles.contentLine}>
                Adjusted by: {item.actorName}
              </Text>
            ) : null}
            {item.targetUserName ? (
              <Text style={styles.contentLine}>
                Member: {item.targetUserName}
              </Text>
            ) : null}
            {amount != null ? (
              <Text style={[styles.deltaLine, {color}]}>
                {formatDelta(amount)}
              </Text>
            ) : null}
            {newCredits != null ? (
              <Text style={styles.balanceLine}>New balance: {newCredits}</Text>
            ) : null}
          </>
        ) : isCheckIn ? (
          <>
            {resolvedKey === 'check_in_manual' ? (
              <Text style={styles.contentLine}>
                Checked in by: {item.actorName ?? 'Host'}
              </Text>
            ) : null}
            {item.targetUserName ? (
              <Text style={styles.contentLine}>
                Member: {item.targetUserName}
              </Text>
            ) : null}
            {sessionDisplay ? (
              <Text style={styles.contentLine}>Session: {sessionDisplay}</Text>
            ) : null}
            {creditsUsed != null ? (
              <View style={styles.creditsRow}>
                <Text style={styles.creditPill}>
                  Credits used: {creditsUsed}
                </Text>
                {remainingCredits != null && (
                  <Text style={styles.creditPill}>
                    Remaining: {remainingCredits}
                  </Text>
                )}
              </View>
            ) : null}
          </>
        ) : (
          <>
            {item.actorName ? (
              <Text style={styles.contentLine}>By: {item.actorName}</Text>
            ) : null}
            {item.targetUserName ? (
              <Text style={styles.contentLine}>
                Member: {item.targetUserName}
              </Text>
            ) : null}
          </>
        )}
      </View>
    );
  };

  if (!currentClub) return null;

  const eventTypeLabel =
    EVENT_TYPE_OPTIONS.find(o => o.value === selectedEventType)?.label ??
    'All Events';

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {/* Filter section � two rows */}
      <View style={styles.filterSection}>
        {/* Row 1: chip filters */}
        <View style={styles.filterRow}>
          {/* Member filter */}
          <TouchableOpacity
            style={[
              styles.filterChip,
              appliedMember && styles.filterChipActive,
            ]}
            onPress={() => setMemberPickerOpen(true)}>
            <Text
              style={[
                styles.filterChipText,
                appliedMember && styles.filterChipTextActive,
              ]}
              numberOfLines={1}>
              {selectedMember ? selectedMember.userName : 'All Members'}
            </Text>
            <Text
              style={[
                styles.filterChipCaret,
                appliedMember && styles.filterChipTextActive,
              ]}>
              ?
            </Text>
          </TouchableOpacity>

          {/* Event type filter */}
          <TouchableOpacity
            style={[
              styles.filterChip,
              appliedEventType && styles.filterChipActive,
            ]}
            onPress={() => setEventTypePickerOpen(true)}>
            <Text
              style={[
                styles.filterChipText,
                appliedEventType && styles.filterChipTextActive,
              ]}
              numberOfLines={1}>
              {eventTypeLabel}
            </Text>
            <Text
              style={[
                styles.filterChipCaret,
                appliedEventType && styles.filterChipTextActive,
              ]}>
              ?
            </Text>
          </TouchableOpacity>
        </View>

        {/* Row 2: date inputs + Apply/Clear + Export */}
        <View style={styles.filterRow}>
          <TextInput
            style={[styles.dateInput, appliedStart && styles.dateInputActive]}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="From YYYY-MM-DD"
            placeholderTextColor="#AEAEB2"
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.dateInput, appliedEnd && styles.dateInputActive]}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="To YYYY-MM-DD"
            placeholderTextColor="#AEAEB2"
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
          {hasActiveFilters && (
            <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
              <Text style={styles.clearBtnText}>?</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.exportBtn,
              (filteredLogs.length === 0 || exporting) &&
                styles.exportBtnDisabled,
            ]}
            onPress={handleExportPdf}
            disabled={filteredLogs.length === 0 || exporting}>
            {exporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                style={[
                  styles.exportBtnText,
                  filteredLogs.length === 0 && styles.exportBtnTextDisabled,
                ]}>
                Export PDF
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Active filter summary */}
      {hasActiveFilters && (
        <View style={styles.activeSummary}>
          <Text style={styles.activeSummaryText}>
            Filtered
            {appliedMember ? ` � ${appliedMember.userName}` : ''}
            {appliedEventType
              ? ` � ${
                  EVENT_TYPE_OPTIONS.find(o => o.value === appliedEventType)
                    ?.label ?? appliedEventType
                }`
              : ''}
            {appliedStart ? ` � from ${appliedStart}` : ''}
            {appliedEnd ? ` � to ${appliedEnd}` : ''}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#007AFF" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() =>
              load(0, false, {
                targetUserId: appliedMember?.userId ?? null,
                startDate: appliedStart,
                endDate: appliedEnd,
              })
            }>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No audit log entries found.</Text>
            </View>
          }
          ListFooterComponent={
            hasMore && !loading ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() =>
                  load(offset, true, {
                    targetUserId: appliedMember?.userId ?? null,
                    startDate: appliedStart,
                    endDate: appliedEnd,
                  })
                }
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
      )}

      {/* Event type picker modal */}
      <Modal
        visible={eventTypePickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEventTypePickerOpen(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Filter by Event Type</Text>
            <FlatList
              data={EVENT_TYPE_OPTIONS}
              keyExtractor={o => o.value ?? '__all__'}
              renderItem={({item: o}) => {
                const isActive = selectedEventType === o.value;
                return (
                  <TouchableOpacity
                    style={[
                      styles.pickerRow,
                      isActive && styles.pickerRowActive,
                    ]}
                    onPress={() => {
                      setSelectedEventType(o.value);
                      setEventTypePickerOpen(false);
                    }}>
                    <Text
                      style={[
                        styles.pickerRowText,
                        isActive && styles.pickerRowTextActive,
                      ]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => (
                <View style={styles.pickerSeparator} />
              )}
            />
            <TouchableOpacity
              style={styles.pickerCancelBtn}
              onPress={() => setEventTypePickerOpen(false)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Member picker modal */}
      <Modal
        visible={memberPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMemberPickerOpen(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Filter by Member</Text>
            <FlatList
              data={[null, ...members]}
              keyExtractor={m => (m ? m.membershipId : '__all__')}
              renderItem={({item}) => {
                const isActive = item
                  ? selectedMember?.membershipId === item.membershipId
                  : selectedMember === null;
                return (
                  <TouchableOpacity
                    style={[
                      styles.pickerRow,
                      isActive && styles.pickerRowActive,
                    ]}
                    onPress={() => {
                      setSelectedMember(item);
                      setMemberPickerOpen(false);
                    }}>
                    <Text
                      style={[
                        styles.pickerRowText,
                        isActive && styles.pickerRowTextActive,
                      ]}>
                      {item ? item.userName : 'All Members'}
                    </Text>
                    {item && (
                      <Text style={styles.pickerRowRole}>{item.role}</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => (
                <View style={styles.pickerSeparator} />
              )}
            />
            <TouchableOpacity
              style={styles.pickerCancelBtn}
              onPress={() => setMemberPickerOpen(false)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: c.background},
    filterSection: {
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 8,
      gap: 8,
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surfaceRaised,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      gap: 4,
      maxWidth: 130,
    },
    filterChipActive: {
      backgroundColor: '#EBF4FF',
      borderWidth: 1,
      borderColor: c.primary,
    },
    filterChipText: {fontSize: 13, color: c.text, flexShrink: 1},
    filterChipTextActive: {color: c.primary},
    filterChipCaret: {fontSize: 10, color: c.textMuted},
    dateInput: {
      flex: 1,
      minWidth: 90,
      backgroundColor: c.surfaceRaised,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: Platform.OS === 'ios' ? 7 : 5,
      fontSize: 12,
      color: c.text,
    },
    dateInputActive: {
      backgroundColor: '#EBF4FF',
      borderWidth: 1,
      borderColor: c.primary,
    },
    applyBtn: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    applyBtnText: {color: '#FFF', fontSize: 13, fontWeight: '600'},
    clearBtn: {
      backgroundColor: c.surfaceRaised,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    clearBtnText: {color: c.textMuted, fontSize: 13, fontWeight: '600'},
    exportBtn: {
      backgroundColor: c.surfaceRaised,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: c.border,
    },
    exportBtnDisabled: {
      opacity: 0.4,
    },
    exportBtnText: {color: c.text, fontSize: 13, fontWeight: '600'},
    exportBtnTextDisabled: {color: c.textMuted},
    activeSummary: {
      paddingHorizontal: 14,
      paddingVertical: 5,
      backgroundColor: '#EBF4FF',
    },
    activeSummaryText: {fontSize: 12, color: c.primary},
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      minHeight: 200,
    },
    errorText: {fontSize: 15, color: c.danger, marginBottom: 12},
    emptyText: {fontSize: 15, color: c.textMuted},
    retryBtn: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    retryBtnText: {color: '#FFF', fontWeight: '700'},
    list: {padding: 12, paddingBottom: 40},
    card: {
      backgroundColor: c.card,
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
      marginBottom: 6,
      gap: 8,
    },
    actionBadge: {
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      flexShrink: 1,
    },
    actionText: {fontSize: 12, fontWeight: '700'},
    time: {fontSize: 11, color: c.textMuted, flexShrink: 0},
    contentLine: {fontSize: 13, color: c.text, marginTop: 4},
    deltaLine: {
      fontSize: 20,
      fontWeight: '700',
      marginTop: 8,
    },
    balanceLine: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 2,
    },
    creditsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 6,
      flexWrap: 'wrap',
    },
    creditPill: {
      fontSize: 12,
      color: c.text,
      backgroundColor: c.surfaceRaised,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    loadMoreBtn: {alignItems: 'center', paddingVertical: 16},
    loadMoreText: {color: c.primary, fontSize: 15, fontWeight: '600'},
    // Picker modal
    pickerOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    pickerSheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 12,
      paddingBottom: 36,
      maxHeight: '70%',
    },
    pickerHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: 'center',
      marginBottom: 12,
    },
    pickerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 13,
      justifyContent: 'space-between',
    },
    pickerRowActive: {backgroundColor: '#EBF4FF'},
    pickerRowText: {fontSize: 15, color: c.text},
    pickerRowTextActive: {color: c.primary, fontWeight: '600'},
    pickerRowRole: {
      fontSize: 11,
      color: c.textMuted,
      textTransform: 'capitalize',
    },
    pickerSeparator: {
      height: 1,
      backgroundColor: c.border,
      marginHorizontal: 16,
    },
    pickerCancelBtn: {
      marginHorizontal: 16,
      marginTop: 8,
      backgroundColor: c.surfaceRaised,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    pickerCancelText: {fontSize: 15, fontWeight: '600', color: c.text},
  });
}
