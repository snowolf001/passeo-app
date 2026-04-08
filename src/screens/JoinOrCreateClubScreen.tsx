import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {joinClub, createClub} from '../services/api/clubApi';
import {
  getMembershipById,
  recoverMembership,
} from '../services/api/membershipApi';
import {useApp} from '../context/AppContext';
import {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinOrCreateClub'>;

export default function JoinOrCreateClubScreen(_: Props) {
  const {setActiveMembershipSession} = useApp();

  const [joinCode, setJoinCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [clubName, setClubName] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [joiningClub, setJoiningClub] = useState(false);
  const [creatingClub, setCreatingClub] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      Alert.alert('Required', 'Please enter a join code.');
      return;
    }
    if (!firstName.trim()) {
      Alert.alert('Required', 'Please enter your first name.');
      return;
    }
    if (!lastName.trim()) {
      Alert.alert('Required', 'Please enter your last name.');
      return;
    }
    setJoiningClub(true);
    try {
      const {membershipId, clubId} = await joinClub(
        joinCode.trim(),
        firstName.trim(),
        lastName.trim(),
      );
      const {membership} = await getMembershipById(membershipId);
      await setActiveMembershipSession({
        membershipId,
        clubId,
        userId: membership.userId,
      });
    } catch (err: any) {
      if (err?.code === 'POSSIBLE_EXISTING_MEMBER') {
        Alert.alert(
          'Name Already Taken',
          'A member with this name already exists in this club.\n\n• If you joined before, use your recovery code to restore your membership.\n• If you lost your code, ask the host or admin to look it up for you.\n• Otherwise, try joining with a different name.',
          [{text: 'OK'}],
        );
      } else {
        Alert.alert('Error', err?.message || 'Failed to join club.');
      }
    } finally {
      setJoiningClub(false);
    }
  };

  const handleCreate = async () => {
    if (!clubName.trim()) {
      Alert.alert('Required', 'Please enter a club name.');
      return;
    }
    setCreatingClub(true);
    try {
      const {membershipId, clubId} = await createClub(clubName.trim());
      const {membership} = await getMembershipById(membershipId);
      await setActiveMembershipSession({
        membershipId,
        clubId,
        userId: membership.userId,
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create club.');
    } finally {
      setCreatingClub(false);
    }
  };

  const handleRestore = async () => {
    if (!recoveryCode.trim()) {
      Alert.alert('Required', 'Please enter your recovery code.');
      return;
    }
    setRestoring(true);
    try {
      const result = await recoverMembership(recoveryCode.trim());
      await setActiveMembershipSession({
        membershipId: result.membership.membershipId,
        clubId: result.membership.clubId,
        userId: result.membership.userId,
      });
    } catch (err: any) {
      Alert.alert(
        'Not Found',
        err?.message || 'No membership found with that recovery code.',
      );
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{flex: 1}}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.appTitle}>Club App</Text>
          <Text style={styles.subtitle}>
            {
              'First time? Join or create a club.\nComing back? Recover your membership below.'
            }
          </Text>

          {/* ── Join a Club ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Join a Club</Text>
            <Text style={styles.cardHint}>
              Use this if you are joining for the first time.
            </Text>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, styles.nameInput]}
                placeholder="First name"
                placeholderTextColor="#AEAEB2"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoCorrect={false}
              />
              <TextInput
                style={[styles.input, styles.nameInput]}
                placeholder="Last name"
                placeholderTextColor="#AEAEB2"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Join code (e.g. IRON2024)"
              placeholderTextColor="#AEAEB2"
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[
                styles.primaryButton,
                !(firstName.trim() && lastName.trim() && joinCode.trim()) &&
                  styles.primaryButtonDisabled,
              ]}
              onPress={handleJoin}
              disabled={
                joiningClub ||
                creatingClub ||
                !firstName.trim() ||
                !lastName.trim() ||
                !joinCode.trim()
              }>
              {joiningClub ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Join Club</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          {/* ── Create a Club ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create a Club</Text>
            <Text style={styles.cardHint}>You will become the owner.</Text>
            <TextInput
              style={styles.input}
              placeholder="Club name"
              placeholderTextColor="#AEAEB2"
              value={clubName}
              onChangeText={setClubName}
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[
                styles.primaryButton,
                !clubName.trim() && styles.primaryButtonDisabled,
              ]}
              onPress={handleCreate}
              disabled={joiningClub || creatingClub || !clubName.trim()}>
              {creatingClub ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Create Club</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Recover Membership ── */}
          <View style={styles.sectionLabelRow}>
            <View style={styles.divider} />
            <Text style={styles.sectionLabelText}>Already a member?</Text>
            <View style={styles.divider} />
          </View>

          <View style={[styles.card, styles.restoreCard]}>
            <Text style={styles.cardTitle}>Recover Membership</Text>
            <Text style={styles.cardHint}>
              Already joined before? Enter your recovery code to restore access.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Recovery Code (e.g. XXXX-XXXX-XXXX)"
              placeholderTextColor="#AEAEB2"
              value={recoveryCode}
              onChangeText={setRecoveryCode}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                !recoveryCode.trim() && styles.secondaryButtonDisabled,
              ]}
              onPress={handleRestore}
              disabled={
                restoring || joiningClub || creatingClub || !recoveryCode.trim()
              }>
              {restoring ? (
                <ActivityIndicator color="#007AFF" />
              ) : (
                <Text style={styles.secondaryButtonText}>
                  Restore Membership
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  scroll: {padding: 24, paddingBottom: 48},
  appTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  restoreCard: {borderWidth: 1, borderColor: '#E5E5EA'},
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  cardHint: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 16,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  sectionLabelText: {
    marginHorizontal: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  input: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1C1C1E',
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 8,
  },
  nameInput: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#B0C4DE',
  },
  primaryButtonText: {color: '#FFF', fontSize: 16, fontWeight: '700'},
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#007AFF',
  },
  secondaryButtonDisabled: {
    borderColor: '#B0C4DE',
  },
  secondaryButtonText: {color: '#007AFF', fontSize: 16, fontWeight: '700'},
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    marginBottom: 16,
  },
  divider: {flex: 1, height: 1, backgroundColor: '#E5E5EA'},
  dividerText: {marginHorizontal: 12, color: '#AEAEB2', fontSize: 14},
});
