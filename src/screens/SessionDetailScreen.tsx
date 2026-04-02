import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useApp} from '../context/AppContext';
import {sessionService} from '../services/sessionService';
import {attendanceService} from '../services/attendanceService';
import {SessionWithLocation, MembershipWithUser} from '../types';
import {RootStackParamList} from '../navigation/types';
import {formatDate} from '../utils/date';
import {openInMaps} from '../utils/maps';
import {db} from '../data/mockData';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionDetail'>;

export default function SessionDetailScreen({route, navigation}: Props) {
  const {sessionId} = route.params;
  const {
    currentMembership,
    decrementCurrentMembershipCredits,
    lastCheckInEvent,
    publishCheckInEvent,
  } = useApp();

  const [session, setSession] = useState<SessionWithLocation | null>(null);
  const [checkedInMembers, setCheckedInMembers] = useState<
    MembershipWithUser[]
  >([]);
  const [loadingSession, setLoadingSession] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);

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
    }, 3000);
  }, []);

  const loadData = useCallback(async () => {
    setLoadingSession(true);
    try {
      const [loadedSession, members] = await Promise.all([
        sessionService.getSessionById(sessionId),
        attendanceService.getCheckedInMembers(sessionId),
      ]);
      setSession(loadedSession);
      setCheckedInMembers(members);
    } finally {
      setLoadingSession(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadData);
    return unsub;
  }, [navigation, loadData]);

  useEffect(() => {
    return () => {
      if (snackTimer.current) {
        clearTimeout(snackTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!lastCheckInEvent) {
      return;
    }

    if (lastCheckInEvent.sessionId !== sessionId) {
      return;
    }

    setCheckedInMembers(prev => {
      const alreadyExists = prev.some(
        m => m.id === lastCheckInEvent.membershipId,
      );
      if (alreadyExists) {
        return prev;
      }

      const membership = db
        .getMemberships()
        .find(m => m.id === lastCheckInEvent.membershipId);
      if (!membership) {
        return prev;
      }

      const user = db.getUsers().find(u => u.id === membership.userId);
      if (!user) {
        return prev;
      }

      return [{...membership, user}, ...prev];
    });
  }, [lastCheckInEvent, sessionId]);

  const isCheckedIn = currentMembership
    ? checkedInMembers.some(m => m.id === currentMembership.id)
    : false;

  const hasCredits = (currentMembership?.credits ?? 0) > 0;
  const canManualCheckIn = currentMembership
    ? ['host', 'admin', 'owner'].includes(currentMembership.role)
    : false;

  const handleSelfCheckIn = async () => {
    if (!currentMembership || !session || checkingIn || isCheckedIn) {
      return;
    }

    setCheckingIn(true);
    try {
      const result = await attendanceService.selfCheckIn({
        membershipId: currentMembership.id,
        sessionId: session.id,
      });

      if (result.success) {
        const checkedInAt = new Date().toISOString();

        showSnackbar('Checked in successfully · 1 credit used');
        decrementCurrentMembershipCredits(1);

        setCheckedInMembers(prev => {
          const alreadyExists = prev.some(m => m.id === currentMembership.id);
          if (alreadyExists) {
            return prev;
          }

          const user = db
            .getUsers()
            .find(u => u.id === currentMembership.userId);
          if (!user) {
            return prev;
          }

          return [{...currentMembership, user}, ...prev];
        });

        publishCheckInEvent({
          membershipId: currentMembership.id,
          sessionId: session.id,
          checkedInAt,
        });
      } else {
        Alert.alert('Check-In Failed', result.message);
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const selfCheckInButtonState = () => {
    if (isCheckedIn) {
      return {
        label: '✅ Already Checked In',
        disabled: true,
        style: styles.btnCheckedIn,
        textStyle: styles.checkInBtnTextDark,
      };
    }

    if (!hasCredits) {
      return {
        label: 'No Credits Remaining',
        disabled: true,
        style: styles.btnDisabled,
        textStyle: styles.checkInBtnTextDark,
      };
    }

    return {
      label: 'Check In',
      disabled: false,
      style: styles.btnCheckIn,
      textStyle: styles.checkInBtnTextLight,
    };
  };

  const ciBtn = selfCheckInButtonState();

  const renderMemberRow = ({item}: {item: MembershipWithUser}) => (
    <View style={styles.memberRow}>
      <Text style={styles.memberName}>{item.user.name}</Text>
      <View style={[styles.roleBadge, roleColor(item.role)]}>
        <Text style={styles.roleBadgeText}>{item.role}</Text>
      </View>
    </View>
  );

  const renderContent = () => {
    if (loadingSession && !session) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color="#007AFF" />
        </View>
      );
    }

    if (!session) {
      return (
        <View style={styles.center}>
          <Text style={styles.errorText}>Session not found.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.linkText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        <View style={styles.infoBlock}>
          <Text style={styles.sessionTitle}>{session.title}</Text>
          <Text style={styles.detailRow}>
            ⏱ {formatDate(session.startTime)}
          </Text>

          {session.endTime && (
            <Text style={styles.detailRow}>
              🏁 Ends {formatDate(session.endTime)}
            </Text>
          )}

          {session.location && (
            <>
              <Text style={styles.detailRow}>📍 {session.location.name}</Text>
              <Text style={styles.addressText}>{session.location.address}</Text>
              <TouchableOpacity
                style={styles.mapsButton}
                onPress={() => openInMaps(session.location!.address)}>
                <Text style={styles.mapsButtonText}>Open in Maps</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.capacityRow}>
            <Text style={styles.capacityText}>
              👥 {checkedInMembers.length}
              {session.capacity != null ? ` / ${session.capacity}` : ''} checked
              in
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.checkInBtn, ciBtn.style]}
            onPress={handleSelfCheckIn}
            disabled={ciBtn.disabled || checkingIn}>
            {checkingIn ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={[styles.checkInBtnTextBase, ciBtn.textStyle]}>
                {ciBtn.label}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {canManualCheckIn && session && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Host Tools</Text>
            <TouchableOpacity
              style={styles.hostButton}
              onPress={() =>
                navigation.navigate('ManualCheckIn', {sessionId: session.id})
              }>
              <Text style={styles.hostButtonText}>Manual Check-In</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Checked In ({checkedInMembers.length})
          </Text>
          {checkedInMembers.length === 0 ? (
            <Text style={styles.emptyText}>No members checked in yet.</Text>
          ) : (
            <FlatList
              data={checkedInMembers}
              keyExtractor={item => item.id}
              renderItem={renderMemberRow}
              scrollEnabled={false}
            />
          )}
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.screenRoot}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}>
          {renderContent()}
        </ScrollView>

        {snackVisible && (
          <View pointerEvents="none" style={styles.snackbar}>
            <Text style={styles.snackbarText}>{snackMsg}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const roleColor = (role: string): object => {
  const map: Record<string, object> = {
    owner: {backgroundColor: '#FFEDD5'},
    admin: {backgroundColor: '#EDE9FE'},
    host: {backgroundColor: '#DBEAFE'},
    member: {backgroundColor: '#F3F4F6'},
  };
  return map[role] ?? map.member;
};

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
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
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
  center: {
    flex: 1,
    minHeight: 280,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    marginBottom: 12,
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBlock: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  sessionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  detailRow: {
    fontSize: 15,
    color: '#3A3A3C',
    marginTop: 4,
  },
  addressText: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
    marginLeft: 22,
  },
  mapsButton: {
    marginTop: 8,
    marginLeft: 22,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  mapsButtonText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
  },
  capacityRow: {
    marginTop: 12,
  },
  capacityText: {
    fontSize: 14,
    color: '#6B7280',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  checkInBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnCheckIn: {
    backgroundColor: '#34C759',
  },
  btnCheckedIn: {
    backgroundColor: '#E5E5EA',
  },
  btnDisabled: {
    backgroundColor: '#E5E5EA',
  },
  checkInBtnTextBase: {
    fontSize: 17,
    fontWeight: '700',
  },
  checkInBtnTextLight: {
    color: '#FFFFFF',
  },
  checkInBtnTextDark: {
    color: '#3A3A3C',
  },
  hostButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  hostButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  memberName: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
  },
});
