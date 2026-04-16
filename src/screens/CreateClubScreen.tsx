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
import AppScreenHeader from '../components/AppScreenHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateClub'>;

export default function CreateClubScreen({navigation}: Props) {
  const {setActiveMembershipSession} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [clubName, setClubName] = useState('');
  const [loading, setLoading] = useState(false);

  const trimmedFirstName = firstName.trim();
  const trimmedLastName = lastName.trim();
  const trimmedClubName = clubName.trim();

  const canSubmit =
    trimmedFirstName.length > 0 &&
    trimmedLastName.length > 0 &&
    trimmedClubName.length > 0 &&
    !loading;

  const handleCreate = async () => {
    if (!canSubmit) return;

    setLoading(true);

    try {
      const {membershipId, clubId, userId} = await createClub(
        trimmedClubName,
        trimmedFirstName,
        trimmedLastName,
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppScreenHeader
        title="Create a Club"
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
              Create your club and invite members with a join code.
            </Text>

            <Text style={styles.subHint}>
              You will become the owner of this club.
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
              disabled={!canSubmit}>
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
    scroll: {paddingHorizontal: 24, paddingBottom: 40},
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
