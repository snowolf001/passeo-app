// src/services/iap/types.ts
/**
 * TEMPLATE MODULE
 * IAP type definitions - reusable across apps
 */

import {Product, Purchase} from 'react-native-iap';

export interface IapProduct extends Product {}
export type IapPurchase = Purchase;

export interface IapConfig {
  productIds: {
    ios: string[];
    android: string[];
  };
  proLifetimeSku: string;
  mockForTesting?: boolean;
}

export interface IapState {
  isInitialized: boolean;
  isReady: boolean;
  products: IapProduct[];
  error: string | null;
}
