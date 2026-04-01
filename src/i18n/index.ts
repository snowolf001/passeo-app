import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import en from './locales/en.json';

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en,
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // react already safes from xss
  },
  compatibilityJSON: 'v3' as any, // Required for React Native + Android
});

export default i18n;
