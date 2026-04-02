import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useApp} from '../context/AppContext';
import {membershipService} from '../services/membershipService';
import {attendanceService} from '../services/attendanceService';
import {db} from '../data/mockData';
import {MembershipWithUser} from '../types';
import {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ManualCheckIn'>;

export default function ManualCheckInScreen({route}: Props) {
  const {sessionId} = route.params;
  const {currentMembership, publishCheckInEvent} = useApp();

  const [members, setMembers] = useState<MembershipWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set());

  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSnackbar = useCallback((message: string) => {
    if (snackTimer.current) {
      clearTimeout(snackTimer.current);
    }

    setSnackMsg(message);
    setSnackVisible(true);

    snackTimer.current = setTimeout(() => {
      setSnackVisible(false);
      setSnackMsg('');
    }, 2500);
  }, []);

  const loadMembers = useCallback(async () => {
    if (!currentMembership) {
      return;
    }

    setLoading(true);

    try {
      const [memberships, attendances] = await Promise.all([
        membershipService.getMembershipsByClub(currentMembership.clubId),
        attendanceService.getAttendancesForSession(sessionId),
      ]);

      const users = db.getUsers();

      const enriched: MembershipWithUser[] = memberships
        .filter(m => m.role === 'member' || m.role === 'host')
        .map(m => ({
          ...m,
          user: users.find(u => u.id === m.userId) ?? {
            id: m.userId,
            name: 'Unknown',
          },
        }));

      setMembers(enriched);
      setCheckedInIds(new Set(attendances.map(a => a.membershipId)));
    } finally {
      setLoading(false);
    }
  }, [currentMembership, sessionId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    return () => {
      if (snackTimer.current) {
        clearTimeout(snackTimer.current);
      }
    };
  }, []);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) {
      return members;
    }

    const q = searchQuery.toLowerCase();
    return members.filter(m => m.user.name.toLowerCase().includes(q));
  }, [members, searchQuery]);

  const handleCheckIn = async (target: MembershipWithUser) => {
    if (!currentMembership || checkingInId) {
      return;
    }

    if (checkedInIds.has(target.id)) {
      return;
    }

    if (target.credits <= 0) {
      return;
    }

    setCheckingInId(target.id);

    try {
      const result = await attendanceService.manualCheckIn({
        actingMembershipId: currentMembership.id,
        targetMembershipId: target.id,
        sessionId,
      });

      if (result.success) {
        const checkedInAt = new Date().toISOString();

        setCheckedInIds(prev => {
          const next = new Set(prev);
          next.add(target.id);
          return next;
        });

        setMembers(prev =>
          prev.map(member =>
            member.id === target.id
              ? {...member, credits: Math.max(0, member.credits - 1)}
              : member,
          ),
        );

        publishCheckInEvent({
          membershipId: target.id,
          sessionId,
          checkedInAt,
        });

        showSnackbar(`${target.user.name} checked in · 1 credit used`);
      } else {
        Alert.alert('Failed', result.message);
      }
    } finally {
      setCheckingInId(null);
    }
  };

  const renderMember = ({item}: {item: MembershipWithUser}) => {
    const isCheckedIn = checkedInIds.has(item.id);
    const hasNoCredits = item.credits <= 0;
    const isDisabled = isCheckedIn || hasNoCredits;
    const isProcessing = checkingInId === item.id;

    return (
      <TouchableOpacity
        style={[styles.memberCard, isDisabled && styles.memberCardDisabled]}
        onPress={() => handleCheckIn(item)}
        disabled={isDisabled || !!checkingInId}>
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, isDisabled && styles.textMuted]}>
            {item.user.name}
          </Text>
          <Text style={styles.memberRole}>{item.role}</Text>
        </View>

        <View style={styles.memberRight}>
          <Text style={[styles.creditText, hasNoCredits && styles.creditEmpty]}>
            {item.credits} credit{item.credits !== 1 ? 's' : ''}
          </Text>

          {isProcessing && <ActivityIndicator size="small" color="#007AFF" />}

          {!isProcessing && isCheckedIn && (
            <View style={styles.badgeSuccess}>
              <Text style={styles.badgeText}>Checked In</Text>
            </View>
          )}

          {!isProcessing && !isCheckedIn && hasNoCredits && (
            <View style={styles.badgeError}>
              <Text style={styles.badgeText}>No Credits</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.screenRoot}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search members by name..."
            placeholderTextColor="#AEAEB2"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            clearButtonMode="always"
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{marginTop: 40}} color="#007AFF" />
        ) : (
          <FlatList
            data={filteredMembers}
            keyExtractor={item => item.id}
            renderItem={renderMember}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.emptyText}>No members found.</Text>
            }
          />
        )}

        {snackVisible && (
          <View pointerEvents="none" style={styles.snackbar}>
            <Text style={styles.snackbarText}>{snackMsg}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  screenRoot: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F5F5F7',
  },
  searchBar: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  searchInput: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 16,
    color: '#1C1C1E',
  },
  listContent: {
    padding: 16,
    paddingBottom: 90,
  },
  memberCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  memberCardDisabled: {
    backgroundColor: '#F2F2F7',
    shadowOpacity: 0,
    elevation: 0,
  },
  memberInfo: {flex: 1},
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 3,
  },
  memberRole: {
    fontSize: 12,
    color: '#8E8E93',
    textTransform: 'uppercase',
  },
  textMuted: {color: '#8E8E93'},
  memberRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  creditText: {
    fontSize: 13,
    color: '#3A3A3C',
  },
  creditEmpty: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  badgeSuccess: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeError: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: '#8E8E93',
    marginTop: 40,
    fontSize: 16,
  },
  snackbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    zIndex: 999,
    elevation: 10,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  snackbarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
});
