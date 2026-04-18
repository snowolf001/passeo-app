import {NavigationContainer} from '@react-navigation/native';
import React, {useEffect} from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {withIAPContext} from 'react-native-iap';

import RootNavigator from './src/navigation/RootNavigator';
import {AppProvider} from './src/context/AppContext';
// initIap is the designated entry point for store listener setup.
// endIap is intentionally NOT called on unmount: it calls RNIap.endConnection()
// which would kill withIAPContext's billing connection.
// NOTE: Do NOT call syncProStatusFromStore() or getAvailablePurchases() here.
// Club Pro status is the backend's responsibility. Each screen/component fetches
// backend subscription status via useClubSubscription() when needed.
import {initIap} from './src/services/iap';
import {useAppTheme} from './src/theme/useAppTheme';
import {trackEvent} from './src/analytics/trackEvent';

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

export default withIAPContext(function App() {
  const {navTheme} = useAppTheme();

  useEffect(() => {
    // initIap is a lightweight no-op entry point. It does not call
    // getAvailablePurchases() or infer club Pro status from the store.
    // Club-level subscription status is fetched from the backend by each
    // screen via useClubSubscription() — not derived from store purchase history.
    initIap().catch(error => {
      console.error('[App] initIap failed:', error);
    });

    trackEvent({eventName: 'app_opened'});

    return () => {
      // NOTE: intentionally not calling endIap() / RNIap.endConnection() here.
      // withIAPContext owns the billing connection lifecycle.
    };
  }, []);
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
});
