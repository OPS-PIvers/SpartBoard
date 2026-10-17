import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '@/locales/en.json';
import type { BackendModule } from 'i18next';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
] as const;

export type SupportedLanguageCode =
  (typeof SUPPORTED_LANGUAGES)[number]['code'];

// Only English ships in the startup bundle; other locales load when picked.
const LOCALE_LOADERS: Record<string, () => Promise<{ default: object }>> = {
  es: () => import('@/locales/es.json'),
  de: () => import('@/locales/de.json'),
  fr: () => import('@/locales/fr.json'),
};

const localeBackend: BackendModule = {
  type: 'backend',
  init: () => undefined,
  read: (language, _namespace, callback) => {
    const load = LOCALE_LOADERS[language];
    if (!load) {
      callback(null, {});
      return;
    }
    load().then(
      (mod) => callback(null, mod.default),
      (err: unknown) =>
        callback(err instanceof Error ? err : new Error(String(err)), null)
    );
  },
};

export const i18nReady = i18n
  .use(localeBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    partialBundledLanguages: true,
    react: { useSuspense: false },
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
