import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import UpgradeScreen from '../screens/UpgradeScreen';
import {useAppTheme} from '../theme/useAppTheme';
import {RootStackParamList} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const {colors} = useAppTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: colors.card},
        headerTintColor: colors.text,
        headerBackTitleVisible: false,
        contentStyle: {backgroundColor: colors.background},
      }}>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{title: 'Club'}}
      />
      <Stack.Screen
        name="Upgrade"
        component={UpgradeScreen}
        options={{title: 'Club Pro'}}
      />
    </Stack.Navigator>
  );
}
