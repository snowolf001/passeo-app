// src/utils/manageSubscription.ts
//
// Opens the platform's native subscription management page.

import {Linking, Platform} from 'react-native';

const MANAGE_URL =
  Platform.OS === 'android'
    ? 'https://play.google.com/store/account/subscriptions'
    : 'https://apps.apple.com/account/subscriptions';

export async function openManageSubscriptions(): Promise<void> {
  const supported = await Linking.canOpenURL(MANAGE_URL);

  if (supported) {
    await Linking.openURL(MANAGE_URL);
  }
}
