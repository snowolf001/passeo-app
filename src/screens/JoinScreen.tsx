import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {joinClub} from '../services/api/clubApi';
import {useApp} from '../context/AppContext';
import {RootStackParamList} from '../navigation/types';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';
import {trackEvent} from '../analytics/trackEvent';
import AppScreenHeader from '../components/AppScreenHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinClub'>;

function formatJoinCode(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function isValidJoinCode(code: string): boolean {
  return code.length >= 6;
}

export default function JoinScreen({navigation}: Props) {
  const {setActiveMembershipSession} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [nameConflict, setNameConflict] = useState(false);

  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  const trimmedCode = joinCode.trim();

  const canSubmit =
    trimmedFirst.length > 0 &&
    trimmedLast.length > 0 &&
    isValidJoinCode(trimmedCode) &&
    !loading;

  const handleJoinCodeChange = (text: string) => {
    setJoinCode(formatJoinCode(text));
  };

  const handleJoin = async () => {
    if (!canSubmit) return;

    setNameConflict(false);
    setLoading(true);

    trackEvent({eventName: 'join_club_attempt', sourceScreen: 'JoinClub'});

    try {
      const {membershipId, clubId, userId} = await joinClub(
        trimmedCode,
        trimmedFirst,
        trimmedLast,
      );

      trackEvent({
        eventName: 'join_club_success',
        sourceScreen: 'JoinClub',
        clubId,
      });

      await setActiveMembershipSession({membershipId, clubId, userId});
    } catch (err: any) {
      const code: string = err?.code ?? '';
      const msg: string = err?.message || 'Failed to join club.';

      if (
        code === 'DISPLAY_NAME_CONFLICT' ||
        code === 'POSSIBLE_EXISTING_MEMBER'
      ) {
        setNameConflict(true);
      } else {
        Alert.alert('Error', msg);
      }

      trackEvent({
        eventName: 'join_club_failed',
        sourceScreen: 'JoinClub',
        errorCode: err?.code ?? 'UNKNOWN',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppScreenHeader
        title="Join a Club"
        onBackPress={() => navigation.goBack()}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scroll}>
            <Text style={styles.hint}>
              Enter your name and the join code from your club owner.
            </Text>

            <Text style={styles.subHint}>
              You&apos;ll join instantly if the code is valid.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="First name"
              placeholderTextColor={colors.textMuted}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />

            <TextInput
              style={styles.input}
              placeholder="Last name"
              placeholderTextColor={colors.textMuted}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />

            <TextInput
              style={styles.input}
              placeholder="Join code (e.g. IRON2024)"
              placeholderTextColor={colors.textMuted}
              value={joinCode}
              onChangeText={handleJoinCodeChange}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleJoin}
            />

            {nameConflict && (
              <View style={styles.conflictBox}>
                <Text style={styles.conflictText}>
                  This name already exists in this club. If you joined before,
                  use your recovery code instead.
                </Text>

                <TouchableOpacity
                  style={styles.recoveryLink}
                  onPress={() => navigation.navigate('RestoreMembership')}>
                  <Text style={styles.recoveryLinkText}>
                    Use Recovery Code →
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={handleJoin}
              disabled={!canSubmit}>
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Join Club</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: c.background},
    flex: {flex: 1},
    scroll: {padding: 24, paddingBottom: 40},

    hint: {
      fontSize: 14,
      color: c.textMuted,
      marginBottom: 8,
    },

    subHint: {
      fontSize: 13,
      color: c.textMuted,
      marginBottom: 20,
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

    button: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    },

    buttonDisabled: {
      backgroundColor: '#8FA7BF',
    },

    buttonText: {
      color: '#FFF',
      fontSize: 16,
      fontWeight: '700',
    },

    conflictBox: {
      backgroundColor: '#FFF3F3',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#FFCDD0',
      padding: 14,
      marginBottom: 12,
    },

    conflictText: {
      fontSize: 13,
      color: '#C0392B',
      lineHeight: 19,
      marginBottom: 10,
    },

    recoveryLink: {
      alignSelf: 'flex-start',
    },

    recoveryLinkText: {
      fontSize: 14,
      color: c.primary,
      fontWeight: '600',
    },
  });
}
