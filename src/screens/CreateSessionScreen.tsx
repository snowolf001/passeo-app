import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useApp} from '../context/AppContext';
import {clubService} from '../services/clubService';
import {sessionService} from '../services/sessionService';
import {ClubLocation} from '../types';
import {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateSession'>;

export default function CreateSessionScreen({navigation}: Props) {
  const {currentMembership} = useApp();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(''); // format: YYYY-MM-DD
  const [startTime, setStartTime] = useState(''); // format: HH:MM
  const [endTime, setEndTime] = useState('');
  const [capacity, setCapacity] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [locations, setLocations] = useState<ClubLocation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentMembership) return;
    clubService.getLocations(currentMembership.clubId).then(locs => {
      setLocations(locs);
      if (locs.length > 0) setSelectedLocationId(locs[0].id);
    });
  }, [currentMembership]);

  const buildISOString = (dateStr: string, timeStr: string): string | null => {
    if (!dateStr || !timeStr) return null;
    const combined = `${dateStr}T${timeStr}:00`;
    const d = new Date(combined);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const handleSubmit = async () => {
    if (!currentMembership) return;

    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a session title.');
      return;
    }
    if (!date.trim() || !startTime.trim()) {
      Alert.alert('Required', 'Please enter a date and start time.');
      return;
    }
    if (!selectedLocationId) {
      Alert.alert('Required', 'Please select a location.');
      return;
    }

    const startISO = buildISOString(date, startTime);
    if (!startISO) {
      Alert.alert(
        'Invalid Date',
        'Use format YYYY-MM-DD and HH:MM (e.g. 2026-04-15 and 07:00).',
      );
      return;
    }

    const endISO = endTime.trim() ? buildISOString(date, endTime) : undefined;

    setLoading(true);
    const result = await sessionService.createSession({
      clubId: currentMembership.clubId,
      title: title.trim(),
      startTime: startISO,
      endTime: endISO ?? undefined,
      locationId: selectedLocationId,
      capacity: capacity ? parseInt(capacity, 10) : undefined,
      createdBy: currentMembership.id,
    });
    setLoading(false);

    if (result.success) {
      Alert.alert('Session Created', result.message, [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } else {
      Alert.alert('Error', result.message);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{flex: 1}}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>Session Title *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Morning HIIT"
              placeholderTextColor="#AEAEB2"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Date * (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="e.g. 2026-04-15"
              placeholderTextColor="#AEAEB2"
              keyboardType="numbers-and-punctuation"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, {flex: 1}]}>
              <Text style={styles.label}>Start Time * (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="07:00"
                placeholderTextColor="#AEAEB2"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={{width: 12}} />
            <View style={[styles.field, {flex: 1}]}>
              <Text style={styles.label}>End Time (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="08:00 (opt.)"
                placeholderTextColor="#AEAEB2"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Capacity (optional)</Text>
            <TextInput
              style={styles.input}
              value={capacity}
              onChangeText={setCapacity}
              placeholder="e.g. 20"
              placeholderTextColor="#AEAEB2"
              keyboardType="number-pad"
            />
          </View>

          {/* Location selector */}
          <View style={styles.field}>
            <Text style={styles.label}>Location *</Text>
            {locations.length === 0 ? (
              <Text style={styles.noLocations}>
                No locations saved yet. Add one in Club Settings.
              </Text>
            ) : (
              locations.map(loc => (
                <TouchableOpacity
                  key={loc.id}
                  style={[
                    styles.locationOption,
                    selectedLocationId === loc.id &&
                      styles.locationOptionSelected,
                  ]}
                  onPress={() => setSelectedLocationId(loc.id)}>
                  <View style={styles.locationRadio}>
                    {selectedLocationId === loc.id && (
                      <View style={styles.locationRadioDot} />
                    )}
                  </View>
                  <View>
                    <Text style={styles.locationName}>{loc.name}</Text>
                    <Text style={styles.locationAddress} numberOfLines={1}>
                      {loc.address}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitButtonText}>Create Session</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  scroll: {padding: 20, paddingBottom: 40},
  field: {marginBottom: 20},
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  row: {flexDirection: 'row'},
  noLocations: {fontSize: 14, color: '#FF3B30', fontStyle: 'italic'},
  locationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    marginBottom: 8,
    gap: 12,
  },
  locationOptionSelected: {borderColor: '#007AFF', backgroundColor: '#EFF6FF'},
  locationRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
  },
  locationName: {fontSize: 15, fontWeight: '600', color: '#1C1C1E'},
  locationAddress: {fontSize: 12, color: '#8E8E93', marginTop: 2},
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {color: '#FFF', fontSize: 17, fontWeight: '700'},
});
