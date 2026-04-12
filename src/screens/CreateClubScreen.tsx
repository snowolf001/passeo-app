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
import {createClub} from '../services/api/clubApi';
import {useApp} from '../context/AppContext';
import {RootStackParamList} from '../navigation/types';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';
import {trackEvent} from '../analytics/trackEvent';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateClub'>;

export default function CreateClubScreen(_: Props) {
  const {setActiveMembershipSession} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [clubName, setClubName] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    clubName.trim().length > 0;

  const handleCreate = async () => {
    setLoading(true);
    try {
      const {membershipId, clubId, userId} = await createClub(
        clubName.trim(),
        firstName.trim(),
        lastName.trim(),
      );
      trackEvent({
        eventName: 'club_created',
        sourceScreen: 'CreateClub',
        clubId,
      });
      await setActiveMembershipSession({membershipId, clubId, userId});
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create club.');
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
              You will become the owner. Members can join using your club code.
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
              placeholder="Club name"
              placeholderTextColor={colors.textMuted}
              value={clubName}
              onChangeText={setClubName}
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />

            <TouchableOpacity
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={loading || !canSubmit}>
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Create Club</Text>
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
