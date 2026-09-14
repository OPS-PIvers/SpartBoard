// Mirrors config/quizReadAloud.ts. Translation locales with a Google voice; so/hmn have none.
const TRANSLATION_TTS_LANGUAGE: Record<string, string> = { es: 'es-US' };

/** The TTS language tag for a translated view, or null when that locale has no voice. */
export function ttsLanguageForTranslationLocale(
  locale: string | undefined | null
): string | null {
  if (!locale) return null;
  return TRANSLATION_TTS_LANGUAGE[locale] ?? null;
}
