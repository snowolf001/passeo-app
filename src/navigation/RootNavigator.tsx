import React from 'react';
import {ActivityIndicator, View} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {RootStackParamList} from './types';
import {useApp} from '../context/AppContext';

import MainTabNavigator from './MainTabNavigator';
import JoinOrCreateClubScreen from '../screens/JoinOrCreateClubScreen';
import SessionDetailScreen from '../screens/SessionDetailScreen';
import ManualCheckInScreen from '../screens/ManualCheckInScreen';
import CreateSessionScreen from '../screens/CreateSessionScreen';
import ClubSettingsScreen from '../screens/ClubSettingsScreen';
import AttendanceHistoryScreen from '../screens/AttendanceHistoryScreen';
import BackfillSessionsScreen from '../screens/BackfillSessionsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const {isLoading, currentMembership} = useApp();

  if (isLoading) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const hasMembership = !!currentMembership;

  return (
    <Stack.Navigator
      initialRouteName={hasMembership ? 'MainTabs' : 'JoinOrCreateClub'}
      screenOptions={{headerShown: false}}>
      <Stack.Screen
        name="JoinOrCreateClub"
        component={JoinOrCreateClubScreen}
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
    </Stack.Navigator>
  );
}
