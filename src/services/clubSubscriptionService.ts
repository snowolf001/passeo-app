import {Platform} from 'react-native';
import type {Purchase} from 'react-native-iap';
import {VerifyPurchasePayload} from '../types/subscription';

export function normalizeForVerify(
  purchase: Purchase,
  clubId: string,
): VerifyPurchasePayload {
  if (Platform.OS === 'ios') {
    return {
      clubId,
      platform: 'ios',
      provider: 'app_store',
      productId: purchase.productId,
      receiptData: purchase.transactionReceipt ?? null,
      transactionId: purchase.transactionId ?? null,
      originalTransactionId: (purchase as any).originalTransactionIdentifierIOS ?? null,
    };
  }
  return {
    clubId,
    platform: 'android',
    provider: 'google_play',
    productId: purchase.productId,
    purchaseToken: (purchase as any).purchaseToken ?? null,
    orderId: purchase.transactionId ?? null,
  };
}

