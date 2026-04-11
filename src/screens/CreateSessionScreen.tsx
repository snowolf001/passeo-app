import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {SafeAreaView} from 'react-native-safe-area-context';
import {KeyboardAwareScrollView} from 'react-native-keyboard-aware-scroll-view';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useApp} from '../context/AppContext';
import {getClubLocations, ApiClubLocation} from '../services/api/clubApi';
import {createSession} from '../services/api/sessionApi';
import {RootStackParamList} from '../navigation/types';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';
import {trackEvent} from '../analytics/trackEvent';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateSession'>;

export default function CreateSessionScreen({navigation}: Props) {
  const {currentMembership} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isAdmin = ['admin', 'owner'].includes(currentMembership?.role ?? '');
  const isHost = currentMembership?.role === 'host';

  const [title, setTitle] = useState('');
  // date/time stored as a single Date object; only date part and time parts used separately
  const [sessionDate, setSessionDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [capacity, setCapacity] = useState('');

  // Picker visibility
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [locations, setLocations] = useState<ApiClubLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSnackbar = useCallback((message: string) => {
    if (snackTimer.current) clearTimeout(snackTimer.current);
    setSnackMsg(message);
    setSnackVisible(true);
    snackTimer.current = setTimeout(() => {
      setSnackVisible(false);
      setSnackMsg('');
    }, 2000);
  }, []);

  const loadLocations = useCallback(() => {
    if (!currentMembership) return;
    setLocationsLoading(true);
    getClubLocations(currentMembership.clubId)
      .then(locs => {
        setLocations(locs);
        // Auto-select when exactly one location exists
        if (locs.length === 1) {
          setSelectedLocationId(locs[0].id);
        } else if (locs.length === 0) {
          setSelectedLocationId(null);
        }
      })
      .catch(() => {})
      .finally(() => setLocationsLoading(false));
  }, [currentMembership]);

  // Load on mount
  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  // Reload when returning from ClubSettings (screen regains focus)
  useEffect(() => {
    const unsub = navigation.addListener('focus', loadLocations);
    return unsub;
  }, [navigation, loadLocations]);

  const combineDateTime = (date: Date, time: Date): Date => {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      time.getHours(),
      time.getMinutes(),
      0,
      0,
    );
  };

  const formatDateLabel = (d: Date | null): string => {
    if (!d) return 'Select date';
    return d.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTimeLabel = (d: Date | null, placeholder: string): string => {
    if (!d) return placeholder;
    return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
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
    if (!sessionDate || !startTime) {
      Alert.alert('Required', 'Please select a date and start time.');
      return;
    }

    const startISO = combineDateTime(sessionDate, startTime).toISOString();
    const endISO = endTime
      ? combineDateTime(sessionDate, endTime).toISOString()
      : null;

    if (endISO && endISO <= startISO) {
      Alert.alert('Invalid Times', 'End time must be after start time.');
      return;
    }

    const capacityNum = capacity.trim() ? parseInt(capacity.trim(), 10) : null;
    if (capacityNum !== null && (isNaN(capacityNum) || capacityNum < 1)) {
      Alert.alert('Invalid Capacity', 'Capacity must be a positive number.');
      return;
    }

    setLoading(true);
    try {
      const session = await createSession({
        clubId: currentMembership.clubId,
        title: title.trim() || null,
        locationId: selectedLocationId,
        startTime: startISO,
        endTime: endISO,
        capacity: capacityNum,
      });
      trackEvent({
        eventName: 'session_created',
        sourceScreen: 'CreateSession',
        clubId: currentMembership.clubId,
        sessionId: session.id,
      });
      showSnackbar('Session created!');
      setTimeout(() => navigation.goBack(), 1500);
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
          {isHost ? (
            <Text style={styles.noLocationBody}>
              You can't create a session yet because no locations have been
              added. Please ask an admin to add one in Club Settings.
            </Text>
          ) : (
            <>
              <Text style={styles.noLocationBody}>
                A session needs a location. Add one in Club Settings first.
              </Text>
              <TouchableOpacity
                style={styles.noLocationButton}
                onPress={() => navigation.navigate('ClubSettings')}>
                <Text style={styles.noLocationButtonText}>
                  Go to Club Settings
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      );
    }

    return (
      <>
        {isHost && (
          <View style={styles.hostInfoBanner}>
            <Text style={styles.hostInfoText}>
              ℹ️ Only admins can add or remove locations.
            </Text>
          </View>
        )}
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
      <KeyboardAwareScrollView
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
        extraScrollHeight={24}
        contentContainerStyle={styles.scroll}>
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
          <Text style={styles.label}>Date *</Text>
          <TouchableOpacity
            style={styles.pickerBtn}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}>
            <Text
              style={[
                styles.pickerBtnText,
                !sessionDate && styles.pickerBtnPlaceholder,
              ]}>
              {formatDateLabel(sessionDate)}
            </Text>
            <Text style={styles.pickerIcon}>📅</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              mode="date"
              value={sessionDate ?? new Date()}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(e: DateTimePickerEvent, d?: Date) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (e.type === 'set' && d) setSessionDate(d);
                else if (Platform.OS !== 'ios') setShowDatePicker(false);
              }}
            />
          )}
        </View>

        <View style={styles.row}>
          <View style={[styles.field, {flex: 1}]}>
            <Text style={styles.label}>Start Time *</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setShowStartPicker(true)}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.pickerBtnText,
                  !startTime && styles.pickerBtnPlaceholder,
                ]}>
                {formatTimeLabel(startTime, 'Select')}
              </Text>
              <Text style={styles.pickerIcon}>🕐</Text>
            </TouchableOpacity>
            {showStartPicker && (
              <DateTimePicker
                mode="time"
                value={startTime ?? new Date()}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                is24Hour={false}
                onChange={(e: DateTimePickerEvent, d?: Date) => {
                  setShowStartPicker(Platform.OS === 'ios');
                  if (e.type === 'set' && d) setStartTime(d);
                  else if (Platform.OS !== 'ios') setShowStartPicker(false);
                }}
              />
            )}
          </View>
          <View style={{width: 12}} />
          <View style={[styles.field, {flex: 1}]}>
            <Text style={styles.label}>End Time</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setShowEndPicker(true)}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.pickerBtnText,
                  !endTime && styles.pickerBtnPlaceholder,
                ]}>
                {formatTimeLabel(endTime, 'Optional')}
              </Text>
              <Text style={styles.pickerIcon}>🕐</Text>
            </TouchableOpacity>
            {showEndPicker && (
              <DateTimePicker
                mode="time"
                value={endTime ?? startTime ?? new Date()}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                is24Hour={false}
                onChange={(e: DateTimePickerEvent, d?: Date) => {
                  setShowEndPicker(Platform.OS === 'ios');
                  if (e.type === 'set' && d) setEndTime(d);
                  else if (Platform.OS !== 'ios') setShowEndPicker(false);
                }}
              />
            )}
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
      </KeyboardAwareScrollView>
      {snackVisible && (
        <View pointerEvents="none" style={styles.snackbar}>
          <Text style={styles.snackbarText}>{snackMsg}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: c.background, position: 'relative'},
    scroll: {padding: 20, paddingBottom: 40},
    field: {marginBottom: 20},
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textMuted,
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    input: {
      backgroundColor: c.card,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    pickerBtn: {
      backgroundColor: c.card,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    pickerBtnText: {
      fontSize: 16,
      color: c.text,
    },
    pickerBtnPlaceholder: {
      color: c.textMuted,
    },
    pickerIcon: {
      fontSize: 16,
    },
    snackbar: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
      zIndex: 999,
      elevation: 10,
      backgroundColor: '#1C1C1E',
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 18,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.25,
      shadowRadius: 8,
    },
    snackbarText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    row: {flexDirection: 'row'},
    // Host info banner
    hostInfoBanner: {
      backgroundColor: '#EFF6FF',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#BFDBFE',
      padding: 10,
      marginBottom: 10,
    },
    hostInfoText: {
      fontSize: 13,
      color: '#1D4ED8',
      lineHeight: 18,
    },
    // Location loading
    locationLoadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
    },
    locationLoadingText: {fontSize: 14, color: c.textMuted},
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
      color: c.textMuted,
      marginBottom: 8,
      fontStyle: 'italic',
    },
    // Location rows
    locationOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      backgroundColor: c.card,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: c.border,
      marginBottom: 8,
      gap: 12,
    },
    locationOptionSelected: {
      borderColor: c.primary,
      backgroundColor: '#EFF6FF',
    },
    locationRadio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    locationRadioDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.primary,
    },
    locationTextWrap: {flex: 1},
    locationName: {fontSize: 15, fontWeight: '600', color: c.text},
    locationNameSelected: {color: c.primary},
    locationAddress: {fontSize: 12, color: c.textMuted, marginTop: 2},
    locationCheck: {
      fontSize: 16,
      fontWeight: '700',
      color: c.primary,
      flexShrink: 0,
    },
    // Submit
    submitButton: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    submitButtonDisabled: {
      backgroundColor: c.textMuted,
    },
    submitButtonText: {color: '#FFF', fontSize: 17, fontWeight: '700'},
  });
}
