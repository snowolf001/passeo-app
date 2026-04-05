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
import {getClubLocations, ApiClubLocation} from '../services/api/clubApi';
import {createSession} from '../services/api/sessionApi';
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
  const [locations, setLocations] = useState<ApiClubLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentMembership) return;
    setLocationsLoading(true);
    getClubLocations(currentMembership.clubId)
      .then(locs => {
        setLocations(locs);
        // Auto-select the only location (or first when multiple)
        if (locs.length === 1) {
          setSelectedLocationId(locs[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLocationsLoading(false));
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

    if (locations.length === 0) {
      Alert.alert(
        'No Locations',
        'Add a club location in Club Settings before creating a session.',
      );
      return;
    }
    if (!selectedLocationId) {
      Alert.alert(
        'Location Required',
        'Please select a location for this session.',
      );
      return;
    }
    if (!date.trim() || !startTime.trim()) {
      Alert.alert('Required', 'Please enter a date and start time.');
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

    const endISO = endTime.trim() ? buildISOString(date, endTime) : null;

    setLoading(true);
    try {
      await createSession({
        clubId: currentMembership.clubId,
        title: title.trim() || null,
        locationId: selectedLocationId,
        startTime: startISO,
        endTime: endISO,
      });
      Alert.alert('Session Created', 'The session has been created.', [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create session.');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !loading && !locationsLoading && locations.length > 0;

  const renderLocationSection = () => {
    if (locationsLoading) {
      return (
        <View style={styles.locationLoadingRow}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.locationLoadingText}>Loading locations…</Text>
        </View>
      );
    }

    if (locations.length === 0) {
      return (
        <View style={styles.noLocationCard}>
          <Text style={styles.noLocationTitle}>No locations added yet</Text>
          <Text style={styles.noLocationBody}>
            A session needs a location. Add one in Club Settings first.
          </Text>
          <TouchableOpacity
            style={styles.noLocationButton}
            onPress={() => navigation.navigate('ClubSettings')}>
            <Text style={styles.noLocationButtonText}>Go to Club Settings</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        {locations.length === 1 && (
          <Text style={styles.locationHint}>
            Your club's location is preselected.
          </Text>
        )}
        {locations.map(loc => {
          const isSelected = selectedLocationId === loc.id;
          return (
            <TouchableOpacity
              key={loc.id}
              style={[
                styles.locationOption,
                isSelected && styles.locationOptionSelected,
              ]}
              activeOpacity={0.7}
              onPress={() => setSelectedLocationId(loc.id)}>
              <View style={styles.locationRadio}>
                {isSelected && <View style={styles.locationRadioDot} />}
              </View>
              <View style={styles.locationTextWrap}>
                <Text
                  style={[
                    styles.locationName,
                    isSelected && styles.locationNameSelected,
                  ]}>
                  {loc.name}
                </Text>
                {!!loc.address && (
                  <Text style={styles.locationAddress} numberOfLines={1}>
                    {loc.address}
                  </Text>
                )}
              </View>
              {isSelected && <Text style={styles.locationCheck}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{flex: 1}}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          {/* Location — first, since it is required and the core choice */}
          <View style={styles.field}>
            <Text style={styles.label}>Location *</Text>
            {renderLocationSection()}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Session Name (Optional)</Text>
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

          <TouchableOpacity
            style={[
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}>
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
  // Location loading
  locationLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  locationLoadingText: {fontSize: 14, color: '#8E8E93'},
  // No-location empty state
  noLocationCard: {
    backgroundColor: '#FFF9F0',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FBBF24',
    padding: 16,
  },
  noLocationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  noLocationBody: {
    fontSize: 14,
    color: '#78350F',
    lineHeight: 20,
    marginBottom: 12,
  },
  noLocationButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  noLocationButtonText: {fontSize: 14, fontWeight: '600', color: '#FFF'},
  // Location hint (single location)
  locationHint: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  // Location rows
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
    flexShrink: 0,
  },
  locationRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
  },
  locationTextWrap: {flex: 1},
  locationName: {fontSize: 15, fontWeight: '600', color: '#1C1C1E'},
  locationNameSelected: {color: '#0059C7'},
  locationAddress: {fontSize: 12, color: '#8E8E93', marginTop: 2},
  locationCheck: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
    flexShrink: 0,
  },
  // Submit
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#AEAEB2',
  },
  submitButtonText: {color: '#FFF', fontSize: 17, fontWeight: '700'},
});
