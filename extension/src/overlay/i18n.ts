import { createInstance } from 'i18next';
import { glPlayer, tours } from '@/locales/en.json';

/** Its own i18next instance with only the tour strings, so the host page's storage is never read. */
export function createOverlayI18n() {
  const i18n = createInstance();
  void i18n.init({
    resources: {
      en: {
        translation: { tours, glPlayer: { readAloud: glPlayer.readAloud } },
      },
    },
    lng: 'en',
    fallbackLng: 'en',
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return i18n;
}
