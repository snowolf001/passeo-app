import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {useAppTheme} from '../theme/useAppTheme';
import {useApp} from '../context/AppContext';
import {setActiveMemberId} from '../config/api';
import {deleteMyAccount} from '../services/api/userApi';
import type {ThemeColors} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'DeleteAccount'>;

export default function DeleteAccountScreen({navigation}: Props) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {clearUserIdentity, storedUserIdentity, currentMembership} = useApp();

  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // The membership to authenticate with — prefer the active membership, fall
  // back to the persisted identity (covers users who left all clubs).
  const membershipId =
    currentMembership?.id ?? storedUserIdentity?.membershipId ?? null;

  const handleDelete = async () => {
    if (!membershipId) {
      Alert.alert(
        'No Account Found',
        'No account identity is stored on this device. There is nothing to delete.',
        [{text: 'OK'}],
      );
      return;
    }

    if (!confirmed) {
      // First tap — show second confirmation
      setConfirmed(true);
      return;
    }

    setIsDeleting(true);
    try {
      // Ensure the x-member-id header is set for the DELETE request.
      setActiveMemberId(membershipId);

      await deleteMyAccount();

      // Wipe all local identity so the app can't restore the old account.
      await clearUserIdentity();

      // Navigate to onboarding — replace the whole stack.
      navigation.reset({
        index: 0,
        routes: [{name: 'JoinOrCreateClub'}],
      });

      Alert.alert('Account Deleted', 'Your account has been deleted.', [
        {text: 'OK'},
      ]);
    } catch (err: any) {
      setIsDeleting(false);
      const code = err?.code as string | undefined;

      if (code === 'OWNER_TRANSFER_REQUIRED') {
        Alert.alert(
          'Cannot Delete Account',
          'You are the owner of one or more clubs. Please transfer ownership before deleting your account.',
          [{text: 'OK'}],
        );
      } else {
        Alert.alert(
          'Error',
          err?.message ?? 'Could not delete account. Please try again.',
          [{text: 'OK'}],
        );
      }
      // Reset confirmation state so the user can try again.
      setConfirmed(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        {/* Warning icon */}
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>⚠️</Text>
        </View>

        <Text style={styles.title}>Delete My Account</Text>

        <Text style={styles.body}>
          This will permanently delete your account and remove your access to
          all clubs.
        </Text>

        <View style={styles.detailList}>
          <Text style={styles.detailItem}>
            •{'  '}Your personal data (name, email) will be deleted.
          </Text>
          <Text style={styles.detailItem}>
            •{'  '}Some historical activity records (e.g. attendance) may be
            retained in anonymized form for club reporting purposes. This data
            cannot be used to identify you.
          </Text>
          <Text style={styles.detailItem}>
            •{'  '}This action cannot be undone.
          </Text>
        </View>

        {confirmed && (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmText}>
              {
                'Your account will be permanently deleted. This cannot be undone.\nTap \u201cDelete My Account\u201d once more to confirm.'
              }
            </Text>
          </View>
        )}

        <Text style={styles.deleteBtnHint}>
          Deleting your account will remove your personal data from this app.
        </Text>

        <TouchableOpacity
          style={[styles.deleteBtn, isDeleting && styles.deleteBtnDisabled]}
          onPress={handleDelete}
          disabled={isDeleting}
          activeOpacity={0.8}>
          {isDeleting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.deleteBtnText}>Delete My Account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
          disabled={isDeleting}
          activeOpacity={0.7}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    scroll: {
      padding: 24,
      paddingBottom: 48,
      alignItems: 'center',
    },
    iconWrap: {
      marginTop: 24,
      marginBottom: 20,
    },
    icon: {
      fontSize: 56,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: c.text,
      marginBottom: 20,
      textAlign: 'center',
    },
    body: {
      fontSize: 15,
      color: c.textMuted,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: 16,
    },
    detailList: {
      width: '100%',
      backgroundColor: c.surfaceRaised,
      borderRadius: 12,
      padding: 16,
      marginBottom: 28,
      gap: 10,
    },
    detailItem: {
      fontSize: 14,
      color: c.textMuted,
      lineHeight: 20,
      textAlign: 'left',
    },
    confirmBox: {
      backgroundColor: '#FFF3CD',
      borderRadius: 10,
      padding: 16,
      marginBottom: 20,
      width: '100%',
    },
    confirmText: {
      fontSize: 14,
      color: '#856404',
      textAlign: 'center',
      lineHeight: 20,
    },
    deleteBtnHint: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
      marginBottom: 10,
      lineHeight: 17,
    },
    deleteBtn: {
      backgroundColor: '#D32F2F',
      borderRadius: 12,
      paddingVertical: 16,
      paddingHorizontal: 24,
      width: '100%',
      alignItems: 'center',
      marginBottom: 12,
    },
    deleteBtnDisabled: {
      opacity: 0.5,
    },
    deleteBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    cancelBtn: {
      paddingVertical: 14,
      width: '100%',
      alignItems: 'center',
    },
    cancelBtnText: {
      color: c.textMuted,
      fontSize: 16,
      fontWeight: '500',
    },
  });
}
