import React, {useCallback, useEffect, useState} from 'react';
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
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useApp} from '../context/AppContext';
import {clubService} from '../services/clubService';
import {ClubLocation} from '../types';
import {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ClubSettings'>;

export default function ClubSettingsScreen({navigation}: Props) {
  const {currentMembership, currentClub, refresh} = useApp();

  const [locations, setLocations] = useState<ClubLocation[]>([]);
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [addingLocation, setAddingLocation] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadLocations = useCallback(async () => {
    if (!currentMembership) return;
    setLoading(true);
    const locs = await clubService.getLocations(currentMembership.clubId);
    setLocations(locs);
    setLoading(false);
  }, [currentMembership]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const handleAddLocation = async () => {
    if (!currentMembership) return;
    if (!locationName.trim() || !locationAddress.trim()) {
      Alert.alert(
        'Required',
        'Please fill in both the location name and address.',
      );
      return;
    }
    setAddingLocation(true);
    const result = await clubService.addLocation(
      currentMembership.clubId,
      locationName,
      locationAddress,
    );
    setAddingLocation(false);
    if (result.success) {
      setLocationName('');
      setLocationAddress('');
      loadLocations();
    } else {
      Alert.alert('Error', result.message);
    }
  };

  const handleTransferOwnership = () => {
    Alert.alert(
      'Transfer Ownership',
      'This will allow you to transfer club ownership to another member. (Coming soon in next release)',
    );
  };

  if (!currentClub || !currentMembership) {
    return null;
  }

  const isOwner = currentMembership.role === 'owner';

  const renderLocation = ({item}: {item: ClubLocation}) => (
    <View style={styles.locationCard}>
      <Text style={styles.locationName}>{item.name}</Text>
      <Text style={styles.locationAddress}>{item.address}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled">
        {/* Club info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Club Info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{currentClub.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Join Code</Text>
            <Text style={[styles.infoValue, styles.joinCode]}>
              {currentClub.joinCode}
            </Text>
          </View>
        </View>

        {/* Locations list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saved Locations</Text>
          {loading ? (
            <ActivityIndicator color="#007AFF" />
          ) : locations.length === 0 ? (
            <Text style={styles.emptyText}>
              No locations yet. Add one below.
            </Text>
          ) : (
            <FlatList
              data={locations}
              keyExtractor={item => item.id}
              renderItem={renderLocation}
              scrollEnabled={false}
            />
          )}
        </View>

        {/* Add location form */}
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

        {/* Owner-only danger zone */}
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
  joinCode: {color: '#007AFF'},
  locationCard: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  locationName: {fontSize: 15, fontWeight: '600', color: '#1C1C1E'},
  locationAddress: {fontSize: 13, color: '#8E8E93', marginTop: 2},
  emptyText: {fontSize: 14, color: '#AEAEB2', fontStyle: 'italic'},
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
});
