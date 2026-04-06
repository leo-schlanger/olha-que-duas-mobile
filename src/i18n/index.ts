/**
 * i18n configuration using i18next and react-i18next
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { logger } from '../utils/logger';

import pt from './locales/pt.json';
import en from './locales/en.json';

const LANGUAGE_STORAGE_KEY = '@olhaqueduas:language';

// Supported languages
export const LANGUAGES = {
  pt: { code: 'pt', name: 'Português', nativeName: 'Português' },
  en: { code: 'en', name: 'English', nativeName: 'English' },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

// Get device language, fallback to Portuguese
function getDeviceLanguage(): LanguageCode {
  const deviceLocale = Localization.getLocales()[0]?.languageCode ?? 'pt';
  return deviceLocale === 'en' ? 'en' : 'pt';
}

// Initialize i18n
i18n.use(initReactI18next).init({
  resources: {
    pt: { translation: pt },
    en: { translation: en },
  },
  lng: getDeviceLanguage(),
  fallbackLng: 'pt',
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  react: {
    useSuspense: false,
  },
});

// Load saved language preference
export async function loadSavedLanguage(): Promise<void> {
  try {
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (savedLanguage && (savedLanguage === 'pt' || savedLanguage === 'en')) {
      await i18n.changeLanguage(savedLanguage);
    }
  } catch (error) {
    logger.error('Failed to load saved language:', error);
  }
}

// Change language and persist preference
export async function changeLanguage(lang: LanguageCode): Promise<void> {
  try {
    await i18n.changeLanguage(lang);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch (error) {
    logger.error('Failed to change language:', error);
  }
}

// Get current language
export function getCurrentLanguage(): LanguageCode {
  return (i18n.language as LanguageCode) || 'pt';
}

export default i18n;
