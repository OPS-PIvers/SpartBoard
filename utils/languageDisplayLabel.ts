import i18next from 'i18next';

import { QUIZ_TRANSLATION_LANGUAGES } from '@/config/quizTranslation';

const appLanguage = (): string =>
  i18next.resolvedLanguage ?? i18next.language ?? 'en';

/** A language tag's name in the teacher's app language (`ru` -> `Russian` in English), for teacher-facing labels. */
export function languageDisplayLabel(
  tag: string,
  displayLocale: string = appLanguage()
): string {
  const code = tag.trim();
  if (!code) return code;
  try {
    const name = new Intl.DisplayNames([displayLocale, 'en'], {
      type: 'language',
      fallback: 'none',
    }).of(code);
    if (name)
      return name.charAt(0).toLocaleUpperCase(displayLocale) + name.slice(1);
  } catch {
    // An unparseable tag or locale falls through to the curated name.
  }
  const curated = QUIZ_TRANSLATION_LANGUAGES.find(
    (l) => l.code.toLowerCase() === code.toLowerCase()
  );
  return curated?.label ?? code;
}
