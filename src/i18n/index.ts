/**
 * i18n configuration using i18next and react-i18next
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Initialize i18n. Language switching is disabled for now — a app é PT-only
// (idioma fixo). O recurso EN e os helpers changeLanguage()/LANGUAGES ficam
// intactos para reativar mais tarde sem voltar a cablar tudo.
i18n.use(initReactI18next).init({
  resources: {
    pt: { translation: pt },
    en: { translation: en },
  },
  lng: 'pt',
  fallbackLng: 'pt',
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  react: {
    useSuspense: false,
  },
});

// Language switching is disabled for now: force PT on startup, overriding any
// language saved by a previous version (e.g. a device that had picked EN).
export async function loadSavedLanguage(): Promise<void> {
  try {
    if (i18n.language !== 'pt') {
      await i18n.changeLanguage('pt');
    }
  } catch (error) {
    logger.error('Failed to set language:', error);
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
