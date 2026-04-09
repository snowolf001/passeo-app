import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Text} from 'react-native';
import {MainTabParamList} from './types';
import {useAppTheme} from '../theme/useAppTheme';

import HomeScreen from '../screens/HomeScreen';
import SessionsScreen from '../screens/SessionsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Simple text icons – no extra library needed for MVP
const TabIcon = ({label, focused}: {label: string; focused: boolean}) => (
  <Text style={{fontSize: 20, opacity: focused ? 1 : 0.4}}>{label}</Text>
);

export default function MainTabNavigator() {
  const {colors} = useAppTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.card,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginBottom: 2,
        },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({focused}) => <TabIcon label="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={SessionsScreen}
        options={{
          tabBarLabel: 'Schedule',
          tabBarIcon: ({focused}) => <TabIcon label="📅" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({focused}) => <TabIcon label="👤" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}
