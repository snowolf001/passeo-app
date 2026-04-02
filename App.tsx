import {NavigationContainer} from '@react-navigation/native';
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Text, TouchableOpacity, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import RootNavigator from './src/navigation/RootNavigator';
import {AppProvider} from './src/context/AppContext';
import {endIap, initIap, syncProStatusFromStore} from './src/services/iap';
import {useAppTheme} from './src/theme/useAppTheme';

const toastConfig = {
  undoToast: ({text1, props}: any) => (
    <View
      style={{
        height: 50,
        width: '90%',
        backgroundColor: '#323232',
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        elevation: 6,
      }}>
      <Text style={{color: 'white', fontWeight: 'bold'}}>{text1}</Text>
      <TouchableOpacity onPress={props.onUndo} hitSlop={15}>
        <Text style={{color: '#81C784', fontWeight: 'bold'}}>UNDO</Text>
      </TouchableOpacity>
    </View>
  ),
  success: (props: any) => (
    <View
      style={{
        height: 50,
        width: '90%',
        backgroundColor: '#4CAF50',
        borderRadius: 8,
        justifyContent: 'center',
        paddingHorizontal: 16,
        elevation: 6,
      }}>
      <Text style={{color: 'white', fontWeight: 'bold'}}>{props.text1}</Text>
    </View>
  ),
  error: (props: any) => (
    <View
      style={{
        height: 50,
        width: '90%',
        backgroundColor: '#D32F2F',
        borderRadius: 8,
        justifyContent: 'center',
        paddingHorizontal: 16,
        elevation: 6,
      }}>
      <Text style={{color: 'white', fontWeight: 'bold'}}>{props.text1}</Text>
    </View>
  ),
};

export default function App() {
  const {navTheme, colors} = useAppTheme();
  const [isEntitlementReady, setIsEntitlementReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const setupIAP = async () => {
      try {
        await initIap();

        if (!isMounted) {
          return;
        }

        await syncProStatusFromStore(true);

        if (!isMounted) {
          return;
        }

        setIsEntitlementReady(true);
      } catch (error) {
        console.error('[App] IAP initialization failed:', error);

        if (isMounted) {
          setIsEntitlementReady(true);
        }
      }
    };

    setupIAP();

    return () => {
      isMounted = false;
      endIap();
    };
  }, []);

  if (!isEntitlementReady) {
    return (
      <GestureHandlerRootView style={{flex: 1}}>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <AppProvider>
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
          </NavigationContainer>
          <Toast config={toastConfig} />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
