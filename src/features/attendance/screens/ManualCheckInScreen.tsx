import React, {useState, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import {User} from '../models/types';
import {AttendanceService} from '../services/attendanceService';

interface ManualCheckInScreenProps {
  route: {params: {sessionId: string}};
  navigation: any;
}

const ManualCheckInScreen: React.FC<ManualCheckInScreenProps> = ({
  route,
  navigation,
}) => {
  const {sessionId} = route.params;

  const [searchQuery, setSearchQuery] = useState('');
  const [members, setMembers] = useState<User[]>([]);
  const [checkedInUserIds, setCheckedInUserIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    // Load all members
    const allUsers = AttendanceService.getUsers();
    const membersOnly = allUsers.filter(u => u.role === 'member');
    setMembers(membersOnly);

    // Load already checked-in users for this session
    const attendances = AttendanceService.getAttendanceForSession(sessionId);
    setCheckedInUserIds(new Set(attendances.map(a => a.userId)));
  }, [sessionId]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) {
      return members;
    }
    const lowerQuery = searchQuery.toLowerCase();
    return members.filter(m => m.name.toLowerCase().includes(lowerQuery));
  }, [members, searchQuery]);

  const handleCheckIn = (member: User) => {
    // Host ID is mocked as 'u2' (Bob Host) for MVP
    const hostId = 'u2';

    const result = AttendanceService.checkInMember(
      member.id,
      sessionId,
      hostId,
      'manual',
    );

    if (result.success) {
      Alert.alert('Success', `${member.name} has been checked in.`, [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } else {
      Alert.alert(
        'Check-In Failed',
        result.message || 'An unknown error occurred.',
      );
    }
  };

  const renderMember = ({item}: {item: User}) => {
    const isCheckedIn = checkedInUserIds.has(item.id);
    const hasNoCredits = item.remainingCredits <= 0;
    const isDisabled = isCheckedIn || hasNoCredits;

    return (
      <TouchableOpacity
        style={[styles.memberCard, isDisabled && styles.memberCardDisabled]}
        onPress={() => handleCheckIn(item)}
        disabled={isDisabled}>
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, isDisabled && styles.textDisabled]}>
            {item.name}
          </Text>
          <Text
            style={[styles.memberCredits, hasNoCredits && styles.errorText]}>
            Credits: {item.remainingCredits}
          </Text>
        </View>

        <View style={styles.statusContainer}>
          {isCheckedIn && (
            <View style={styles.badgeSuccess}>
              <Text style={styles.badgeText}>Checked In</Text>
            </View>
          )}
          {!isCheckedIn && hasNoCredits && (
            <View style={styles.badgeError}>
              <Text style={styles.badgeText}>No Credits</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Manual Check-In</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search members by name..."
          placeholderTextColor="#8E8E93"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          clearButtonMode="always"
        />
      </View>

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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 16,
    color: '#1C1C1E',
  },
  listContent: {
    padding: 16,
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
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  memberCredits: {
    fontSize: 14,
    color: '#3A3A3C',
  },
  textDisabled: {
    color: '#8E8E93',
  },
  errorText: {
    color: '#FF3B30',
    fontWeight: '500',
  },
  statusContainer: {
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  badgeSuccess: {
    backgroundColor: '#34C759',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeError: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#8E8E93',
    marginTop: 40,
    fontSize: 16,
  },
});

export default ManualCheckInScreen;
