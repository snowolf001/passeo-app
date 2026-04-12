import React, {useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';
import {BRANDING} from '../config/branding';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinOrCreateClub'>;

export default function JoinOrCreateClubScreen({navigation}: Props) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>{BRANDING.appDisplayName}</Text>
          <View style={styles.helperWrap}>
            <Text style={styles.helperRow}>
              <Text style={styles.helperBold}>First time? </Text>
              <Text style={styles.helperMuted}>Join or create a club.</Text>
            </Text>
            <Text style={styles.helperRow}>
              <Text style={styles.helperBold}>Coming back? </Text>
              <Text style={styles.helperMuted}>Restore your membership.</Text>
            </Text>
          </View>
        </View>

        {/* Action cards */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('JoinClub')}
            activeOpacity={0.7}>
            <Text style={styles.cardIcon}>🏃</Text>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>Join a Club</Text>
              <Text style={styles.cardDesc}>
                Join an existing club with a code
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('CreateClub')}
            activeOpacity={0.7}>
            <Text style={styles.cardIcon}>✨</Text>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>Create a Club</Text>
              <Text style={styles.cardDesc}>Start your own club</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, styles.cardOutline]}
            onPress={() => navigation.navigate('RestoreMembership')}
            activeOpacity={0.7}>
            <Text style={styles.cardIcon}>🔑</Text>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>Restore Membership</Text>
              <Text style={styles.cardDesc}>Use your recovery code</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: c.background},
    inner: {
      flex: 1,
      paddingHorizontal: 24,
      paddingVertical: 24,
      justifyContent: 'center',
    },
    header: {
      alignItems: 'center',
      marginBottom: 48,
    },
    appName: {
      fontSize: 36,
      fontWeight: 'bold',
      color: c.text,
      marginBottom: 16,
      letterSpacing: -0.5,
    },
    helperWrap: {gap: 4, alignItems: 'center'},
    helperRow: {fontSize: 15, textAlign: 'center'},
    helperBold: {fontWeight: '600', color: c.text},
    helperMuted: {color: c.textMuted},
    actions: {gap: 14},
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      gap: 16,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    cardOutline: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: c.border,
      shadowOpacity: 0,
      elevation: 0,
    },
    cardIcon: {fontSize: 26},
    cardBody: {flex: 1},
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
      marginBottom: 2,
    },
    cardDesc: {fontSize: 13, color: c.textMuted},
    chevron: {fontSize: 22, color: c.textMuted, fontWeight: '300'},
  });
}
