import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Switch,
  Clipboard,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useApp} from '../context/AppContext';
import {
  getClubLocations,
  addClubLocation,
  deleteClubLocation,
  updateClubSettings as apiUpdateClubSettings,
  getClubSettings,
  regenerateJoinCode,
  ApiClubLocation,
} from '../services/api/clubApi';
import {ClubSettings, DEFAULT_CLUB_SETTINGS} from '../types';
import {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ClubSettings'>;

export default function ClubSettingsScreen({navigation}: Props) {
  const {currentMembership, currentClub, updateCurrentClubSettings} = useApp();

  const [locations, setLocations] = useState<ApiClubLocation[]>([]);
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [addingLocation, setAddingLocation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [localSettings, setLocalSettings] = useState<ClubSettings>(
    currentClub?.settings ?? DEFAULT_CLUB_SETTINGS,
  );
  const [joinCode, setJoinCode] = useState<string | null>(
    currentClub?.joinCode ?? null,
  );
  const [regenerating, setRegenerating] = useState(false);

  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSnackbar = useCallback((message: string) => {
    if (snackTimer.current) {
      clearTimeout(snackTimer.current);
    }
    setSnackMsg(message);
    setSnackVisible(true);
    snackTimer.current = setTimeout(() => {
      setSnackVisible(false);
      setSnackMsg('');
    }, 2500);
  }, []);

  const loadData = useCallback(async () => {
    if (!currentMembership) {
      return;
    }

    setLoading(true);
    try {
      const [locs, settings] = await Promise.all([
        getClubLocations(currentMembership.clubId),
        getClubSettings(currentMembership.clubId),
      ]);
      setLocations(locs);
      setLocalSettings({
        allowMemberBackfill: settings.allowMemberBackfill,
        memberBackfillHours: settings.memberBackfillHours,
        hostBackfillHours: settings.hostBackfillHours,
      });
    } catch (err) {
      console.warn('[ClubSettings] loadData error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentMembership]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddLocation = async () => {
    if (!currentMembership) {
      return;
    }

    if (!locationName.trim() || !locationAddress.trim()) {
      Alert.alert(
        'Required',
        'Please fill in both the location name and address.',
      );
      return;
    }

    setAddingLocation(true);
    try {
      const newLoc = await addClubLocation(
        currentMembership.clubId,
        locationName.trim(),
        locationAddress.trim(),
      );
      setLocationName('');
      setLocationAddress('');
      setLocations(prev => [...prev, newLoc]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add location.');
    } finally {
      setAddingLocation(false);
    }
  };

  const handleRegenerateJoinCode = () => {
    Alert.alert(
      'Regenerate Join Code',
      'The old code will stop working immediately. Are you sure?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            if (!currentMembership) return;
            setRegenerating(true);
            try {
              const result = await regenerateJoinCode(currentMembership.clubId);
              setJoinCode(result.joinCode);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to regenerate.');
            } finally {
              setRegenerating(false);
            }
          },
        },
      ],
    );
  };

  const handleDeleteLocation = (item: ApiClubLocation) => {
    Alert.alert(
      'Delete Location',
      'Delete this location? This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!currentMembership) return;
            try {
              await deleteClubLocation(currentMembership.clubId, item.id);
              setLocations(prev => prev.filter(l => l.id !== item.id));
              showSnackbar('Location deleted');
            } catch (err: any) {
              const code = err?.code as string | undefined;
              if (code === 'LOCATION_NOT_DELETABLE') {
                Alert.alert(
                  'Cannot Delete',
                  'This location cannot be deleted because it has been used by one or more sessions.',
                );
              } else {
                Alert.alert(
                  'Error',
                  err?.message ??
                    'Could not delete location. Please try again.',
                );
              }
            }
          },
        },
      ],
    );
  };

  const handleTransferOwnership = () => {
    Alert.alert(
      'Transfer Ownership',
      'This will allow you to transfer club ownership to another member. (Coming soon in next release)',
    );
  };

  const handleSettingChange = async <K extends keyof ClubSettings>(
    key: K,
    value: ClubSettings[K],
  ) => {
    if (!currentMembership) {
      return;
    }

    const updated: ClubSettings = {
      ...localSettings,
      [key]: value,
    };

    setLocalSettings(updated);
    updateCurrentClubSettings(updated);
    try {
      await apiUpdateClubSettings(currentMembership.clubId, {
        allowMemberBackfill: updated.allowMemberBackfill,
        memberBackfillHours: updated.memberBackfillHours,
        hostBackfillHours: updated.hostBackfillHours,
      });
    } catch (err) {
      console.warn('[ClubSettings] updateClubSettings error:', err);
    }
  };

  if (!currentClub || !currentMembership) {
    return null;
  }

  const isOwner = currentMembership.role === 'owner';
  const isAdminOrOwner = ['admin', 'owner'].includes(currentMembership.role);
  const canSeeJoinCode = ['owner', 'admin', 'host'].includes(
    currentMembership.role,
  );
  const canRegenerateJoinCode = ['owner', 'admin'].includes(
    currentMembership.role,
  );

  const renderLocation = ({item}: {item: ApiClubLocation}) => (
    <View style={styles.locationCard}>
      <View style={styles.locationInfo}>
        <Text style={styles.locationName}>{item.name}</Text>
        <Text style={styles.locationAddress}>{item.address}</Text>
      </View>
      {isAdminOrOwner && (
        <TouchableOpacity
          style={styles.locationDeleteBtn}
          onPress={() => handleDeleteLocation(item)}>
          <Text style={styles.locationDeleteBtnText}>Delete</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Club Info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{currentClub.name}</Text>
          </View>
          {canSeeJoinCode && (
            <View style={styles.joinCodeRow}>
              <Text style={styles.infoLabel}>Join Code</Text>
              <View style={styles.joinCodeActions}>
                <Text style={styles.joinCodeValue}>
                  {joinCode ?? currentClub.joinCode}
                </Text>
                <TouchableOpacity
                  style={styles.joinCodeBtn}
                  onPress={() => {
                    Clipboard.setString(joinCode ?? currentClub.joinCode ?? '');
                    showSnackbar('Join code copied');
                  }}>
                  <Text style={styles.joinCodeBtnText}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saved Locations</Text>
          {loading ? (
            <ActivityIndicator color="#007AFF" />
          ) : locations.length === 0 ? (
            <Text style={styles.emptyText}>
              {isAdminOrOwner
                ? 'No locations yet. Add one below.'
                : 'No locations have been added yet.'}
            </Text>
          ) : (
            <FlatList
              data={locations}
              keyExtractor={item => item.id}
              renderItem={renderLocation}
              scrollEnabled={false}
            />
          )}
          {!isAdminOrOwner && (
            <Text style={styles.hostNote}>
              Only admins can add or edit locations.
            </Text>
          )}
        </View>

        {isAdminOrOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add Location</Text>
            <TextInput
              style={styles.input}
              placeholder="Location name (e.g. Main Studio)"
              placeholderTextColor="#AEAEB2"
              value={locationName}
              onChangeText={setLocationName}
            />
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Full address"
              placeholderTextColor="#AEAEB2"
              value={locationAddress}
              onChangeText={setLocationAddress}
              multiline
            />
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAddLocation}
              disabled={addingLocation}>
              {addingLocation ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.addButtonText}>Add Location</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {isAdminOrOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Check-In Policy</Text>

            <View style={styles.settingRow}>
              <View style={styles.settingLabelWrap}>
                <Text style={styles.settingLabel}>
                  Allow Member Self Backfill
                </Text>
                <Text style={styles.settingHint}>
                  Members can check in after a session ends
                </Text>
              </View>
              <Switch
                value={localSettings.allowMemberBackfill}
                onValueChange={val =>
                  handleSettingChange('allowMemberBackfill', val)
                }
                trackColor={{false: '#E5E5EA', true: '#34C759'}}
                thumbColor="#FFF"
              />
            </View>

            {localSettings.allowMemberBackfill && (
              <>
                <Text style={styles.settingGroupLabel}>
                  Member Backfill Window
                </Text>
                <View style={styles.optionRow}>
                  {[12, 24, 48].map(h => (
                    <TouchableOpacity
                      key={h}
                      style={[
                        styles.optionPill,
                        localSettings.memberBackfillHours === h &&
                          styles.optionPillActive,
                      ]}
                      onPress={() =>
                        handleSettingChange('memberBackfillHours', h)
                      }>
                      <Text
                        style={[
                          styles.optionPillText,
                          localSettings.memberBackfillHours === h &&
                            styles.optionPillTextActive,
                        ]}>
                        {h}h
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.settingGroupLabel}>
              Host / Admin Backfill Window
            </Text>
            <View style={styles.optionRow}>
              {([24, 48, 72, 168] as const).map(h => (
                <TouchableOpacity
                  key={h}
                  style={[
                    styles.optionPill,
                    localSettings.hostBackfillHours === h &&
                      styles.optionPillActive,
                  ]}
                  onPress={() => handleSettingChange('hostBackfillHours', h)}>
                  <Text
                    style={[
                      styles.optionPillText,
                      localSettings.hostBackfillHours === h &&
                        styles.optionPillTextActive,
                    ]}>
                    {h === 168 ? '7d' : `${h}h`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {isOwner && (
          <View style={[styles.section, styles.dangerZone]}>
            <Text style={styles.sectionTitle}>Ownership</Text>
            <TouchableOpacity
              style={styles.dangerButton}
              onPress={handleTransferOwnership}>
              <Text style={styles.dangerButtonText}>Transfer Ownership</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      {snackVisible && (
        <View pointerEvents="none" style={styles.snackbar}>
          <Text style={styles.snackbarText}>{snackMsg}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F7'},
  scroll: {padding: 20, paddingBottom: 40},
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  infoLabel: {fontSize: 14, color: '#8E8E93'},
  infoValue: {fontSize: 14, fontWeight: '600', color: '#1C1C1E'},
  joinCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  joinCodeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  joinCodeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  joinCodeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#E5F0FF',
    borderRadius: 6,
  },
  joinCodeBtnText: {fontSize: 12, fontWeight: '600', color: '#007AFF'},
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
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {fontSize: 15, fontWeight: '600', color: '#1C1C1E'},
  locationAddress: {fontSize: 13, color: '#8E8E93', marginTop: 2},
  locationDeleteBtn: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#FF3B30',
  },
  locationDeleteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF3B30',
  },
  emptyText: {fontSize: 14, color: '#AEAEB2', fontStyle: 'italic'},
  hostNote: {
    fontSize: 13,
    color: '#8E8E93',
    fontStyle: 'italic',
    marginTop: 8,
  },
  input: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C1C1E',
    marginBottom: 10,
  },
  inputMulti: {minHeight: 72, textAlignVertical: 'top'},
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  addButtonText: {color: '#FFF', fontSize: 15, fontWeight: '700'},
  dangerZone: {borderWidth: 1, borderColor: '#FFE2E2'},
  dangerButton: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FF3B30',
  },
  dangerButtonText: {color: '#FF3B30', fontSize: 15, fontWeight: '700'},
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    marginBottom: 4,
  },
  settingLabelWrap: {flex: 1, paddingRight: 12},
  settingLabel: {fontSize: 15, fontWeight: '500', color: '#1C1C1E'},
  settingHint: {fontSize: 12, color: '#8E8E93', marginTop: 2},
  settingGroupLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  optionPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginRight: 8,
    marginBottom: 8,
  },
  optionPillActive: {
    backgroundColor: '#EAF3FF',
    borderColor: '#007AFF',
  },
  optionPillText: {fontSize: 14, fontWeight: '600', color: '#3A3A3C'},
  optionPillTextActive: {color: '#007AFF'},
});
