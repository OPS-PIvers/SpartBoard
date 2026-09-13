/**
 * Switches the app shell to a student's accommodation language for the life of
 * one session WITHOUT persisting it (D34): the detector caches to
 * `spart_language`, and a shared Chromebook must not inherit the choice.
 * The key's value is snapshotted and restored after every switch.
 */

import { useEffect } from 'react';
import i18n, { SUPPORTED_LANGUAGES } from '@/i18n';

const STORAGE_KEY = 'spart_language';

const isAppLocale = (code: string | undefined): boolean =>
  !!code && SUPPORTED_LANGUAGES.some((l) => l.code === code);

function readKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function restoreKey(previous: string | null): void {
  try {
    if (previous === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, previous);
  } catch {
    // A blocked store can't have been written either; nothing to undo.
  }
}

/** Applies `locale` to the app shell while mounted; a no-op for non-app locales. */
export function useEphemeralAppLanguage(locale: string | undefined): void {
  useEffect(() => {
    if (!isAppLocale(locale) || i18n.language === locale) return;
    const storedBefore = readKey();
    const languageBefore = i18n.language;
    void i18n.changeLanguage(locale).finally(() => restoreKey(storedBefore));
    restoreKey(storedBefore);
    return () => {
      void i18n
        .changeLanguage(languageBefore)
        .finally(() => restoreKey(storedBefore));
      restoreKey(storedBefore);
    };
  }, [locale]);
}
