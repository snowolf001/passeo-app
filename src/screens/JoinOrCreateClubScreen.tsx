import React, {useMemo, useRef, useState} from 'react';
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
import {
  joinClub,
  createClub,
  recoverClubMembership,
} from '../services/api/clubApi';
import {
  getMembershipById,
  recoverMembership,
} from '../services/api/membershipApi';
import {useApp} from '../context/AppContext';
import {RootStackParamList} from '../navigation/types';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinOrCreateClub'>;

export default function JoinOrCreateClubScreen(_: Props) {
  const {setActiveMembershipSession} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);

  const [joinCode, setJoinCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [clubName, setClubName] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [joiningClub, setJoiningClub] = useState(false);
  const [creatingClub, setCreatingClub] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // Stores the conflict joinCode so recovery can be club-scoped
  const [conflictJoinCode, setConflictJoinCode] = useState<string | null>(null);
  const [nameConflictError, setNameConflictError] = useState(false);

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
    setNameConflictError(false);
    setConflictJoinCode(null);
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
      if (
        err?.code === 'DISPLAY_NAME_CONFLICT' ||
        err?.code === 'POSSIBLE_EXISTING_MEMBER'
      ) {
        setNameConflictError(true);
        setConflictJoinCode(joinCode.trim());
        // Scroll down so user can see the conflict message and recovery section
        setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 100);
      } else {
        Alert.alert('Error', err?.message || 'Failed to join club.');
      }
    } finally {
      setJoiningClub(false);
    }
  };

  const handleUseRecoveryCode = () => {
    // Pre-fill the recover name from what was just typed
    setNameConflictError(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 100);
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
        err?.message || 'No membership found. Check your recovery code.',
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
          ref={scrollRef}
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
            {nameConflictError && (
              <View style={styles.conflictBox}>
                <Text style={styles.conflictText}>
                  {
                    'This name already exists in this club.\nIf you already joined this club before, please use your recovery code. Otherwise, choose a different name.'
                  }
                </Text>
                <TouchableOpacity
                  style={styles.useRecoveryBtn}
                  onPress={handleUseRecoveryCode}>
                  <Text style={styles.useRecoveryBtnText}>
                    Use Recovery Code
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
              {conflictJoinCode
                ? `Enter your recovery code to restore your "${
                    firstName.trim() || ''
                  } ${lastName.trim() || ''}" membership.`
                : 'Already joined before? Enter your recovery code to restore access.'}
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

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: c.background},
    scroll: {padding: 24, paddingBottom: 48},
    appTitle: {
      fontSize: 32,
      fontWeight: 'bold',
      color: c.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: c.textMuted,
      textAlign: 'center',
      marginBottom: 32,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    restoreCard: {borderWidth: 1, borderColor: c.border},
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
      marginBottom: 4,
    },
    cardHint: {
      fontSize: 13,
      color: c.textMuted,
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
      color: c.text,
    },
    input: {
      backgroundColor: c.surfaceRaised,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: c.text,
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
      backgroundColor: c.primary,
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
      borderColor: c.primary,
    },
    secondaryButtonDisabled: {
      borderColor: '#B0C4DE',
    },
    secondaryButtonText: {color: c.primary, fontSize: 16, fontWeight: '700'},
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 4,
      marginBottom: 16,
    },
    divider: {flex: 1, height: 1, backgroundColor: c.border},
    dividerText: {marginHorizontal: 12, color: c.textMuted, fontSize: 14},
    conflictBox: {
      marginTop: 12,
      backgroundColor: '#FFF3F3',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#FFCDD0',
      padding: 14,
    },
    conflictText: {
      fontSize: 13,
      color: '#C0392B',
      lineHeight: 18,
      marginBottom: 10,
    },
    useRecoveryBtn: {
      alignSelf: 'flex-start',
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: c.primary,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    useRecoveryBtnText: {fontSize: 13, fontWeight: '700', color: c.primary},
  });
}
