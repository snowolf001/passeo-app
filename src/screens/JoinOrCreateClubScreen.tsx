import React, {useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Linking} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {useAppTheme} from '../theme/useAppTheme';
import {useApp} from '../context/AppContext';
import type {ThemeColors} from '../theme/colors';
import {BRANDING} from '../config/branding';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinOrCreateClub'>;

export default function JoinOrCreateClubScreen({navigation}: Props) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {storedUserIdentity} = useApp();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.appName}>{BRANDING.appDisplayName}</Text>
          <Text style={styles.title}>Join or restore your club access</Text>
          <Text style={styles.subtitle}>
            Join an existing club to get started, or restore your membership if
            you&apos;re returning.
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryCard}
            onPress={() => navigation.navigate('JoinClub')}
            activeOpacity={0.85}>
            <View style={styles.iconWrapPrimary}>
              <Text style={styles.cardIcon}>🏃</Text>
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.primaryCardTitle}>Join a Club</Text>
              <Text style={styles.primaryCardDesc}>
                Join an existing club with a code
              </Text>
            </View>

            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryCard}
            onPress={() => navigation.navigate('RestoreMembership')}
            activeOpacity={0.85}>
            <View style={styles.iconWrapSecondary}>
              <Text style={styles.cardIcon}>🔑</Text>
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.secondaryCardTitle}>Restore Membership</Text>
              <Text style={styles.secondaryCardDesc}>
                Use your recovery code
              </Text>
            </View>

            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerHint}>Starting a new club?</Text>

          <TouchableOpacity
            onPress={() => navigation.navigate('CreateClub')}
            activeOpacity={0.7}
            style={styles.createLinkButton}>
            <Text style={styles.createLinkText}>Create your own club →</Text>
          </TouchableOpacity>

          {!!storedUserIdentity && (
            <TouchableOpacity
              onPress={() => navigation.navigate('DeleteAccount')}
              activeOpacity={0.7}
              style={styles.deleteAccountLink}>
              <Text style={styles.deleteAccountLinkText}>
                Delete My Account
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.webDeletionSection}>
            <Text style={styles.webDeletionHeading}>
              Need to delete an old account?
            </Text>
            <Text style={styles.webDeletionBody}>
              If you deleted or reinstalled the app and no longer have access to
              your account on this device, you can request account deletion from
              our website.
            </Text>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(
                  'https://cleanutilityapps.com/passeo/delete-account/',
                )
              }
              activeOpacity={0.7}
              style={styles.webDeletionButton}>
              <Text style={styles.webDeletionButtonText}>
                Request Account Deletion
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },

    inner: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 24,
      justifyContent: 'center',
    },

    header: {
      alignItems: 'center',
      marginBottom: 30,
    },

    appName: {
      fontSize: 34,
      fontWeight: '800',
      color: c.text,
      marginBottom: 14,
      letterSpacing: -0.5,
      textAlign: 'center',
    },

    title: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '800',
      color: c.text,
      textAlign: 'center',
      marginBottom: 10,
      paddingHorizontal: 12,
    },

    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: c.textMuted,
      textAlign: 'center',
      paddingHorizontal: 8,
    },

    actions: {
      marginTop: 4,
    },

    primaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 18,
      marginBottom: 14,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
    },

    secondaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surfaceRaised,
      borderRadius: 18,
      paddingHorizontal: 20,
      paddingVertical: 15,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
    },

    iconWrapPrimary: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.08)',
      marginRight: 16,
    },

    iconWrapSecondary: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.04)',
      marginRight: 16,
    },

    cardIcon: {
      fontSize: 24,
    },

    cardBody: {
      flex: 1,
      paddingRight: 12,
    },

    primaryCardTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: c.text,
      marginBottom: 4,
    },

    primaryCardDesc: {
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },

    secondaryCardTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: c.text,
      marginBottom: 2,
    },

    secondaryCardDesc: {
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },

    chevron: {
      fontSize: 24,
      color: c.textMuted,
      fontWeight: '300',
    },

    footer: {
      alignItems: 'center',
      marginTop: 22,
    },

    footerHint: {
      fontSize: 13,
      color: c.textMuted,
      marginBottom: 6,
      textAlign: 'center',
    },

    createLinkButton: {
      paddingHorizontal: 8,
      paddingVertical: 8,
    },

    createLinkText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.primary,
      textAlign: 'center',
    },

    deleteAccountLink: {
      paddingHorizontal: 8,
      paddingVertical: 10,
      marginTop: 8,
    },

    deleteAccountLinkText: {
      fontSize: 13,
      color: '#B71C1C',
      textAlign: 'center',
    },

    webDeletionSection: {
      marginTop: 20,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      alignItems: 'center',
      paddingHorizontal: 8,
    },

    webDeletionHeading: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textAlign: 'center',
      marginBottom: 6,
    },

    webDeletionBody: {
      fontSize: 12,
      lineHeight: 18,
      color: c.textMuted,
      textAlign: 'center',
      marginBottom: 10,
    },

    webDeletionButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },

    webDeletionButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textMuted,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
  });
}
