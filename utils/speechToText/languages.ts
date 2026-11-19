/** App language code to recognition locale. Hmong has no recogniser; Somali is tried and falls back at runtime (D12). */
const DICTATION_LOCALES: Readonly<Record<string, string>> = {
  en: 'en-US',
  es: 'es-US',
  ru: 'ru-RU',
  so: 'so-SO',
};

const base = (code: string): string => code.trim().toLowerCase().split('-')[0];

/** The recognition locale for an app language code, or null when none exists. */
export function dictationLocaleFor(code: string): string | null {
  return DICTATION_LOCALES[base(code)] ?? null;
}

/** English first, then the student's translation language when it can be dictated. */
export function dictationLanguages(translationLanguage?: string): string[] {
  const out = ['en'];
  if (!translationLanguage) return out;
  const code = base(translationLanguage);
  if (code !== 'en' && dictationLocaleFor(code)) out.push(code);
  return out;
}
