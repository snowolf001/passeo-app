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
import {useApp} from '../context/AppContext';
import {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinOrCreateClub'>;

export default function JoinOrCreateClubScreen({navigation}: Props) {
  const {refresh} = useApp();

  const [joinCode, setJoinCode] = useState('');
  const [clubName, setClubName] = useState('');
  const [memberCode, setMemberCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      Alert.alert('Required', 'Please enter a join code.');
      return;
    }
    setLoading(true);
    try {
      await joinClub(joinCode.trim());
      await refresh();
      navigation.replace('MainTabs');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to join club.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!clubName.trim()) {
      Alert.alert('Required', 'Please enter a club name.');
      return;
    }
    setLoading(true);
    try {
      await createClub(clubName.trim());
      await refresh();
      navigation.replace('MainTabs');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create club.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!memberCode.trim() || !recoveryCode.trim()) {
      Alert.alert(
        'Required',
        'Please enter both your Member ID and Recovery Code.',
      );
      return;
    }
    Alert.alert(
      'Coming Soon',
      'Membership restore is not yet available in this version.',
    );
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
            Get started by joining or creating a club.
          </Text>

          {/* ── Join a Club ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Join a Club</Text>
            <Text style={styles.cardHint}>
              Enter the join code provided by your club admin.
            </Text>
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
              style={styles.primaryButton}
              onPress={handleJoin}
              disabled={loading}>
              {loading ? (
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
              style={styles.primaryButton}
              onPress={handleCreate}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Create Club</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Restore Membership ── */}
          <View style={[styles.card, styles.restoreCard]}>
            <Text style={styles.cardTitle}>Restore Membership</Text>
            <Text style={styles.cardHint}>
              Had a membership before? Restore it with your Member ID and
              Recovery Code.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Member ID"
              placeholderTextColor="#AEAEB2"
              value={memberCode}
              onChangeText={setMemberCode}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Recovery Code"
              placeholderTextColor="#AEAEB2"
              value={recoveryCode}
              onChangeText={setRecoveryCode}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleRestore}
              disabled={loading}>
              <Text style={styles.secondaryButtonText}>Restore Membership</Text>
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
  input: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1C1C1E',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {color: '#FFF', fontSize: 16, fontWeight: '700'},
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#007AFF',
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
