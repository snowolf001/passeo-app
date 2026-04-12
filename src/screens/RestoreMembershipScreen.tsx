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

export default function RestoreMembershipScreen(_: Props) {
  const {setActiveMembershipSession} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [recoveryCode, setRecoveryCode] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = recoveryCode.trim().length > 0;

  const handleRestore = async () => {
    setLoading(true);
    trackEvent({
      eventName: 'recovery_attempt',
      sourceScreen: 'RestoreMembership',
    });
    try {
      const result = await recoverMembership(recoveryCode.trim());
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
              Use a code from a previous install or device.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Recovery code (e.g. XXXX-XXXX-XXXX)"
              placeholderTextColor={colors.textMuted}
              value={recoveryCode}
              onChangeText={setRecoveryCode}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleRestore}
            />

            <TouchableOpacity
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={handleRestore}
              disabled={loading || !canSubmit}>
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
    hint: {fontSize: 14, color: c.textMuted, marginBottom: 24},
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
    buttonDisabled: {backgroundColor: '#B0C4DE'},
    buttonText: {color: '#FFF', fontSize: 16, fontWeight: '700'},
  });
}
