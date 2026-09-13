// Quiz translation constants shared by the admin card, the Languages tab and the hook (plan §7).
import type { QuizQuestionType, QuizTranslationSettings } from '@/types';

/** D21: FIB stems are not translated in v1 — the blank markup does not survive. */
export function isTranslatableQuestionType(type: QuizQuestionType): boolean {
  return type !== 'FIB';
}

export const QUIZ_TRANSLATION_FEATURE = 'quiz-translation' as const;
export const QUIZ_TRANSLATION_SETTINGS_DOC = 'quiz_translation';

/** Curated target languages (D19). `nativeLabel` is data rendered to students, never an i18n key. */
export const QUIZ_TRANSLATION_LANGUAGES: readonly {
  code: string;
  label: string;
  nativeLabel: string;
}[] = [
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'so', label: 'Somali', nativeLabel: 'Soomaali' },
  { code: 'hmn', label: 'Hmong', nativeLabel: 'Hmoob' },
];

export const QUIZ_TRANSLATION_DEFAULT_CAPS = {
  monthlyCapUnits: 2000,
  monthlyCapOutputTokens: 8_000_000,
} as const;

/** Every curated code; the fallback `enabledLanguages` when the settings doc is absent (§5). */
export const QUIZ_TRANSLATION_ALL_CODES: readonly string[] =
  QUIZ_TRANSLATION_LANGUAGES.map((l) => l.code);

export const DEFAULT_QUIZ_TRANSLATION_SETTINGS: QuizTranslationSettings = {
  enabledLanguages: [...QUIZ_TRANSLATION_ALL_CODES],
  monthlyCapUnits: QUIZ_TRANSLATION_DEFAULT_CAPS.monthlyCapUnits,
  monthlyCapOutputTokens: QUIZ_TRANSLATION_DEFAULT_CAPS.monthlyCapOutputTokens,
  updatedAt: 0,
  updatedBy: '',
};

const positiveInt = (raw: unknown, fallback: number): number =>
  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? Math.floor(raw)
    : fallback;

/** Fills a partial or malformed `admin_settings/quiz_translation` doc with the defaults. */
export function normalizeQuizTranslationSettings(
  raw: unknown
): QuizTranslationSettings {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const enabled = Array.isArray(src.enabledLanguages)
    ? src.enabledLanguages.filter(
        (c): c is string =>
          typeof c === 'string' && QUIZ_TRANSLATION_ALL_CODES.includes(c)
      )
    : null;
  return {
    enabledLanguages: enabled ?? [...QUIZ_TRANSLATION_ALL_CODES],
    monthlyCapUnits: positiveInt(
      src.monthlyCapUnits,
      QUIZ_TRANSLATION_DEFAULT_CAPS.monthlyCapUnits
    ),
    monthlyCapOutputTokens: positiveInt(
      src.monthlyCapOutputTokens,
      QUIZ_TRANSLATION_DEFAULT_CAPS.monthlyCapOutputTokens
    ),
    updatedAt: positiveInt(src.updatedAt, 0),
    updatedBy: typeof src.updatedBy === 'string' ? src.updatedBy : '',
  };
}

/** `ai_usage/global_translation_{YYYY-MM}` doc id for the month containing `date`. */
export function monthlyTranslationUsageDocId(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `global_translation_${y}-${m}`;
}
