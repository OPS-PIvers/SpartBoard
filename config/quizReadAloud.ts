// Quiz read-aloud (Cloud Text-to-Speech) constants shared by the editor, admin card and PR2 functions.
import type { QuizReadAloudAdminSettings } from '@/types';

export const QUIZ_READ_ALOUD_FEATURE = 'quiz-read-aloud' as const;
export const QUIZ_READ_ALOUD_SETTINGS_DOC = 'quiz_read_aloud';
export const DEFAULT_QUIZ_LANGUAGE = 'en-US';

/** The app's four UI locales; other BCP-47 tags are typed in by hand. */
export const QUIZ_READ_ALOUD_LANGUAGES: readonly {
  tag: string;
  label: string;
}[] = [
  { tag: 'en-US', label: 'English (US)' },
  { tag: 'es-US', label: 'Spanish (US)' },
  { tag: 'de-DE', label: 'German' },
  { tag: 'fr-FR', label: 'French' },
];

/** Cloud TTS voice names per language, Neural2 first and Standard second. */
export const QUIZ_READ_ALOUD_VOICES: Record<
  string,
  { neural2: string[]; standard: string[] }
> = {
  'en-US': {
    neural2: ['A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(
      (v) => `en-US-Neural2-${v}`
    ),
    standard: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(
      (v) => `en-US-Standard-${v}`
    ),
  },
  'es-US': {
    neural2: ['A', 'B', 'C'].map((v) => `es-US-Neural2-${v}`),
    standard: ['A', 'B', 'C'].map((v) => `es-US-Standard-${v}`),
  },
  'de-DE': {
    neural2: ['A', 'B', 'C', 'D', 'F', 'G', 'H'].map(
      (v) => `de-DE-Neural2-${v}`
    ),
    standard: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(
      (v) => `de-DE-Standard-${v}`
    ),
  },
  'fr-FR': {
    neural2: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(
      (v) => `fr-FR-Neural2-${v}`
    ),
    standard: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(
      (v) => `fr-FR-Standard-${v}`
    ),
  },
};

export const DEFAULT_QUIZ_READ_ALOUD_SETTINGS: QuizReadAloudAdminSettings = {
  voicesByLanguage: {
    'en-US': 'en-US-Neural2-F',
    'es-US': 'es-US-Neural2-A',
    'de-DE': 'de-DE-Neural2-F',
    'fr-FR': 'fr-FR-Neural2-A',
  },
  standardVoicesByLanguage: {
    'en-US': 'en-US-Standard-H',
    'es-US': 'es-US-Standard-A',
    'de-DE': 'de-DE-Standard-F',
    'fr-FR': 'fr-FR-Standard-A',
  },
  defaultLanguage: DEFAULT_QUIZ_LANGUAGE,
  neural2MonthlyCapChars: 900_000,
  speakingRateDefault: 1.0,
};

const stringMap = (raw: unknown): Record<string, string> => {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.length > 0) out[k] = v;
  }
  return out;
};

/** Fills a partial or malformed `admin_settings/quiz_read_aloud` doc with the defaults. */
export function normalizeQuizReadAloudSettings(
  raw: unknown
): QuizReadAloudAdminSettings {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const cap = src.neural2MonthlyCapChars;
  const rate = src.speakingRateDefault;
  return {
    voicesByLanguage: {
      ...DEFAULT_QUIZ_READ_ALOUD_SETTINGS.voicesByLanguage,
      ...stringMap(src.voicesByLanguage),
    },
    standardVoicesByLanguage: {
      ...DEFAULT_QUIZ_READ_ALOUD_SETTINGS.standardVoicesByLanguage,
      ...stringMap(src.standardVoicesByLanguage),
    },
    defaultLanguage:
      typeof src.defaultLanguage === 'string' && src.defaultLanguage
        ? src.defaultLanguage
        : DEFAULT_QUIZ_LANGUAGE,
    neural2MonthlyCapChars:
      typeof cap === 'number' && Number.isFinite(cap) && cap >= 0
        ? Math.floor(cap)
        : DEFAULT_QUIZ_READ_ALOUD_SETTINGS.neural2MonthlyCapChars,
    speakingRateDefault:
      typeof rate === 'number' && Number.isFinite(rate) && rate > 0
        ? rate
        : DEFAULT_QUIZ_READ_ALOUD_SETTINGS.speakingRateDefault,
  };
}

/** Translation locale (D19 codes) → TTS language tag; codes absent here have no Google voice. */
export const QUIZ_TRANSLATION_TTS_LANGUAGE: Readonly<Record<string, string>> = {
  es: 'es-US',
};

/** The TTS language tag for a translated view, or null when that locale has no voice (so/hmn). */
export function ttsLanguageForTranslationLocale(
  locale: string | undefined | null
): string | null {
  if (!locale) return null;
  return QUIZ_TRANSLATION_TTS_LANGUAGE[locale] ?? null;
}

/** `ai_usage/global_tts_{YYYY-MM}` doc id for the month containing `date`. */
export function monthlyTtsUsageDocId(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `global_tts_${y}-${m}`;
}
