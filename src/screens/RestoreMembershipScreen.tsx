import React, {useMemo, useState} from 'react';
import {
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
import {recoverMembership} from '../services/api/membershipApi';
import {useApp} from '../context/AppContext';
import {RootStackParamList} from '../navigation/types';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';
import {trackEvent} from '../analytics/trackEvent';

type Props = NativeStackScreenProps<RootStackParamList, 'RestoreMembership'>;

function normalizeRecoveryCode(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 12);
}

function formatRecoveryCode(input: string): string {
  const raw = normalizeRecoveryCode(input);

  if (raw.length <= 4) {
    return raw;
  }

  if (raw.length <= 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  }

  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

function isValidRecoveryCode(code: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
}

export default function RestoreMembershipScreen(_: Props) {
  const {setActiveMembershipSession} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [recoveryCode, setRecoveryCode] = useState('');
  const [loading, setLoading] = useState(false);

  const trimmedCode = recoveryCode.trim();
  const canSubmit = isValidRecoveryCode(trimmedCode) && !loading;

  const handleRecoveryCodeChange = (text: string) => {
    setRecoveryCode(formatRecoveryCode(text));
  };

  const handleRestore = async () => {
    if (!canSubmit) return;

    setLoading(true);

    trackEvent({
      eventName: 'recovery_attempt',
      sourceScreen: 'RestoreMembership',
    });

    try {
      const result = await recoverMembership(trimmedCode);

      trackEvent({
        eventName: 'recovery_success',
        sourceScreen: 'RestoreMembership',
        clubId: result.membership.clubId,
      });

      await setActiveMembershipSession({
        membershipId: result.membership.membershipId,
        clubId: result.membership.clubId,
        userId: result.membership.userId,
      });
    } catch (err: any) {
      trackEvent({
        eventName: 'recovery_failed',
        sourceScreen: 'RestoreMembership',
        errorCode: err?.code ?? 'UNKNOWN',
      });

      Alert.alert(
        'Not Found',
        err?.message || 'No membership found. Check your recovery code.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scroll}>
            <Text style={styles.hint}>
              Use a recovery code from a previous install or device.
            </Text>

            <Text style={styles.subHint}>
              Your membership will be restored immediately if the code is valid.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Recovery code (e.g. XXXX-XXXX-XXXX)"
              placeholderTextColor={colors.textMuted}
              value={recoveryCode}
              onChangeText={handleRecoveryCodeChange}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleRestore}
            />

            <TouchableOpacity
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={handleRestore}
              disabled={!canSubmit}>
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Restore</Text>
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
  });
}
