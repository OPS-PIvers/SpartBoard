/** Native-language label for a BCP-47 tag (e.g. `es` -> `Español`), for override chips. */

import { QUIZ_TRANSLATION_LANGUAGES } from '@/config/quizTranslation';

/** Curated labels win; `Intl` is only consulted for tags outside the catalog. */
export function languageNativeLabel(tag: string): string {
  const code = tag.trim();
  if (!code) return code;
  const curated = QUIZ_TRANSLATION_LANGUAGES.find(
    (l) => l.code.toLowerCase() === code.toLowerCase()
  );
  if (curated) return curated.nativeLabel;
  try {
    const label = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    return label && label.toLowerCase() !== code.toLowerCase() ? label : code;
  } catch {
    return code;
  }
}
