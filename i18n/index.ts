import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import es from '../locales/es.json';
import de from '../locales/de.json';
import fr from '../locales/fr.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
] as const;

export type SupportedLanguageCode =
  (typeof SUPPORTED_LANGUAGES)[number]['code'];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      de: { translation: de },
      fr: { translation: fr },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'de', 'fr'],
    // Only use localStorage to persist user choice.
    // Default to 'en' if no choice is made to avoid browser-language surprises.
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'spart_language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
