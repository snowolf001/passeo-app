import {Platform} from 'react-native';

// ============================================
// APP IDENTITY
// ============================================
export const APP_CONFIG = {
  /**
   * App display name
   * Used in: UI titles, alerts, watermarks
   */
  APP_NAME: 'Passeo',

  /**
   * App bundle/package identifier
   * Should match your iOS Bundle ID and Android Package Name
   */
  BUNDLE_ID: Platform.select({
    ios: 'com.cleanutilityapps.passeo',
    android: 'com.cleanutilityapps.passeo',
  }),

  /**
   * App version (read from package.json at runtime)
   */
  VERSION: require('../../package.json').version,
} as const;

// ============================================
// MONETIZATION & IAP
// ============================================
export const IAP_CONFIG = {
  /**
   * Product IDs for subscriptions
   * Must match products configured in App Store Connect / Google Play Console
   */
  PRODUCT_IDS: Platform.select({
    ios: ['passeo_pro_monthly', 'Passeo_pro_yearly'],
    android: ['passeo_pro_monthly', 'passeo_pro_yearly'],
    default: [],
  })!,

  /**
   * Club Pro subscription SKUs
   */
  PRO_MONTHLY_SKU: 'passeo_pro_monthly',
  PRO_YEARLY_SKU: Platform.OS === 'ios' ? 'Passeo_pro_yearly' : 'passeo_pro_yearly',

  /**
   * Mock IAP for testing (only works in __DEV__)
   * Set to true to test purchase flow without store setup
   */
  MOCK_IAP_IN_DEV: false,

  /**
   * Display prices (fallback if store price fails to load)
   */
  PRO_MONTHLY_PRICE_DISPLAY: '$4.99',
  PRO_YEARLY_PRICE_DISPLAY: '$39.99',
} as const;

// ============================================
// FEATURE LIMITS
// ============================================
export const FREE_LIMITS = {
  /**
   * Daily exports limit for free users
   * Pro users: unlimited
   */
  DAILY_EXPORTS: 3,

  /**
   * Maximum pages per document for free users
   * Set to -1 for unlimited
   */
  PAGES_PER_DOCUMENT: -1, // -1 = unlimited

  /**
   * Maximum documents for free users
   * Set to -1 for unlimited
   */
  MAX_DOCUMENTS: -1, // -1 = unlimited
} as const;

// ============================================
// BRANDING
// ============================================
export const BRANDING = {
  WATERMARK_ENABLED: false,

  /**
   * Watermark text for free users' PDF exports
   * Pro users: no watermark
   */
  WATERMARK_TEXT: `${APP_CONFIG.APP_NAME}`,

  /**
   * Support/contact email
   */
  SUPPORT_EMAIL: 'cleanutilityapps@gmail.com',

  /**
   * Privacy policy URL
   */
  PRIVACY_URL: 'https://snowolf001.github.io/passeo-privacy',

  /**
   * Terms of service URL
   */
  TERMS_URL: 'https://snowolf001.github.io/passeo-terms',
} as const;

// ============================================
// FEATURE FLAGS
// ============================================
export const FEATURES = {
  /**
   * Enable scan session tracking
   */
  TRACK_SCAN_SESSIONS: true,

  /**
   * Enable undo/redo for deletions
   */
  ENABLE_UNDO: true,

  /**
   * Enable batch processing
   */
  ENABLE_BATCH_PROCESSING: true,

  /**
   * Enable tips/hints system
   */
  ENABLE_TIPS: true,

  /**
   * Enable PDF caching
   */
  ENABLE_PDF_CACHE: true,
} as const;

export const PDF_FEATURES = {
  ENABLE_CJK: false,
} as const;

// ============================================
// STORAGE KEYS
// ============================================
const STORAGE_PREFIX = `@${APP_CONFIG.APP_NAME.toLowerCase().replace(
  /\s+/g,
  '',
)}`;

export const STORAGE_KEYS = {
  IS_PRO: `${STORAGE_PREFIX}:isPro`,
  EXPORTS_TODAY: `${STORAGE_PREFIX}:exportsToday`,
  EXPORT_DATE: `${STORAGE_PREFIX}:exportDate`,
  DEV_FORCE_PRO: `${STORAGE_PREFIX}:devForcePro`, // DEV-only
} as const;

// ============================================
// TYPE EXPORTS
// ============================================
export type AppConfig = typeof APP_CONFIG;
export type IapConfig = typeof IAP_CONFIG;
export type FreeLimits = typeof FREE_LIMITS;
export type BrandingConfig = typeof BRANDING;
export type FeatureFlags = typeof FEATURES;
