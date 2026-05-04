import React from 'react';
import {ActivityIndicator, Text, TouchableOpacity, View} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';

import {RootStackParamList} from './types';
import {useApp} from '../context/AppContext';
import {useAppTheme} from '../theme/useAppTheme';

import MainTabNavigator from './MainTabNavigator';
import JoinOrCreateClubScreen from '../screens/JoinOrCreateClubScreen';
import JoinScreen from '../screens/JoinScreen';
import CreateClubScreen from '../screens/CreateClubScreen';
import RestoreMembershipScreen from '../screens/RestoreMembershipScreen';
import SessionDetailScreen from '../screens/SessionDetailScreen';
import ManualCheckInScreen from '../screens/ManualCheckInScreen';
import CreateSessionScreen from '../screens/CreateSessionScreen';
import ClubSettingsScreen from '../screens/ClubSettingsScreen';
import AttendanceHistoryScreen from '../screens/AttendanceHistoryScreen';
import BackfillSessionsScreen from '../screens/BackfillSessionsScreen';
import CreditHistoryScreen from '../screens/CreditHistoryScreen';
import MemberCreditHistoryScreen from '../screens/MemberCreditHistoryScreen';
import MemberHistoryScreen from '../screens/MemberHistoryScreen';
import ReportsScreen from '../screens/ReportsScreen';
import AuditLogScreen from '../screens/AuditLogScreen';
import MemberCreditsScreen from '../screens/MemberCreditsScreen';
import ClubProScreen from '../screens/ClubProScreen';
import PdfPreviewScreen from '../screens/PdfPreviewScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const {isLoading, currentMembership} = useApp();
  const {colors} = useAppTheme();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const hasMembership = !!currentMembership;

  function BackButton() {
    const navigation = useNavigation();
    return (
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
        style={{paddingRight: 8}}>
        <Text style={{fontSize: 24, color: colors.text}}>←</Text>
      </TouchableOpacity>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={hasMembership ? 'MainTabs' : 'JoinOrCreateClub'}
      screenOptions={{
        headerShown: false,
        headerBackVisible: false,
        headerStyle: {backgroundColor: colors.background},
        headerTintColor: colors.text,
        headerTitleStyle: {fontWeight: '700', fontSize: 18},
        headerShadowVisible: false,
        headerLeft: () => <BackButton />,
      }}>
      <Stack.Screen
        name="JoinOrCreateClub"
        component={JoinOrCreateClubScreen}
      />
      <Stack.Screen
        name="JoinClub"
        component={JoinScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="CreateClub"
        component={CreateClubScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="RestoreMembership"
        component={RestoreMembershipScreen}
        options={{headerShown: false}}
      />

      <Stack.Screen name="MainTabs" component={MainTabNavigator} />

      <Stack.Screen
        name="SessionDetail"
        component={SessionDetailScreen}
        options={{headerShown: true, title: 'Session Details'}}
      />
      <Stack.Screen
        name="ManualCheckIn"
        component={ManualCheckInScreen}
        options={{headerShown: true, title: 'Manual Check-In'}}
      />
      <Stack.Screen
        name="CreateSession"
        component={CreateSessionScreen}
        options={{headerShown: true, title: 'New Session'}}
      />
      <Stack.Screen
        name="ClubSettings"
        component={ClubSettingsScreen}
        options={{headerShown: true, title: 'Club Settings'}}
      />
      <Stack.Screen
        name="AttendanceHistory"
        component={AttendanceHistoryScreen}
        options={{headerShown: true, title: 'Attendance History'}}
      />
      <Stack.Screen
        name="BackfillSessions"
        component={BackfillSessionsScreen}
        options={{headerShown: true, title: 'Backfill Sessions'}}
      />
      <Stack.Screen
        name="CreditHistory"
        component={CreditHistoryScreen}
        options={{headerShown: true, title: 'Credit History'}}
      />
      <Stack.Screen
        name="MemberCreditHistory"
        component={MemberCreditHistoryScreen}
        options={({route}) => ({
          headerShown: true,
          title: route.params?.memberName
            ? `${route.params.memberName}'s Credits`
            : 'Credit History',
        })}
      />
      <Stack.Screen
        name="MemberHistory"
        component={MemberHistoryScreen}
        options={({route}) => ({
          headerShown: true,
          title: route.params?.title ?? 'Member History',
        })}
      />
      <Stack.Screen
        name="Reports"
        component={ReportsScreen}
        options={{headerShown: true, title: 'Reports'}}
      />
      <Stack.Screen
        name="AuditLog"
        component={AuditLogScreen}
        options={{headerShown: true, title: 'Audit Log'}}
      />
      <Stack.Screen
        name="MemberCredits"
        component={MemberCreditsScreen}
        options={{headerShown: true, title: 'Manage Members'}}
      />
      <Stack.Screen
        name="ClubPro"
        component={ClubProScreen}
        options={{headerShown: true, title: 'Club Pro'}}
      />
      <Stack.Screen
        name="PdfPreview"
        component={PdfPreviewScreen}
        options={({route}) => ({
          headerShown: true,
          title: route.params?.title ?? 'PDF Preview',
        })}
      />
      <Stack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{headerShown: true, title: 'Delete My Account'}}
      />
    </Stack.Navigator>
  );
}
