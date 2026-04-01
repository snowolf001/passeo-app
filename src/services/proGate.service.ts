// src/services/proGate.ts
import {NavigationProp} from '@react-navigation/native';
import {ProGateParams} from '../navigation/proGate';

/**
 * Checks if user is Pro. If not, navigates to Upgrade screen with "return ticket".
 * Returns true if the action can proceed immediately.
 * Returns false if navigation occurred (caller should abort).
 */
export async function requireProOrNavigate(
  navigation: NavigationProp<any>,
  isProPromise: Promise<boolean> | boolean,
  proParams: ProGateParams,
): Promise<boolean> {
  const isPro = await isProPromise;
  if (isPro) {
    return true;
  }

  // Navigate to Upgrade screen, passing the gate params
  // The Upgrade screen will use these to return after successful purchase
  navigation.navigate('Upgrade', {proGate: proParams});
  return false;
}
