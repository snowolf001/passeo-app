// src/config/constants.ts
/**
 * DEPRECATED: Use appConfig.ts instead
 * This file is kept for backward compatibility
 */

import {BRANDING, FREE_LIMITS, IAP_CONFIG} from './appConfig';

// Re-export from centralized config for backward compatibility
export const FREE_DAILY_EXPORTS_LIMIT = FREE_LIMITS.DAILY_EXPORTS;
export const PRO_PRICE_DISPLAY = IAP_CONFIG.PRO_MONTHLY_PRICE_DISPLAY;
export const WATERMARK_TEXT = BRANDING.WATERMARK_TEXT;

// Deprecated product IDs (use IAP_CONFIG instead)
export const PRODUCT_ID_PRO = 'com.cleanutilityapps.passeo.pro';
export const PRODUCT_ID_TIP = 'com.cleanutilityapps.passeo.tip';
