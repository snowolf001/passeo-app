import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import UpgradeScreen from '../screens/UpgradeScreen';

import SessionsScreen from '../features/attendance/screens/SessionsScreen';
import SessionDetailScreen from '../features/attendance/screens/SessionDetailScreen';
import ManualCheckInScreen from '../features/attendance/screens/ManualCheckInScreen';

import {RootStackParamList} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Home">
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{title: 'Club App'}}
      />

      <Stack.Screen
        name="Upgrade"
        component={UpgradeScreen}
        options={{title: 'Club Pro'}}
      />

      {/* Club Flow */}
      <Stack.Screen
        name="Sessions"
        component={SessionsScreen}
        options={{title: 'Sessions'}}
      />

      <Stack.Screen
        name="SessionDetail"
        component={SessionDetailScreen}
        options={{title: 'Session Details'}}
      />

      <Stack.Screen
        name="ManualCheckIn"
        component={ManualCheckInScreen}
        options={{title: 'Manual Check-In'}}
      />
    </Stack.Navigator>
  );
}
