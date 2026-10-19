import type {
  FlashcardsSpeakAdminConfig,
  SpeakGroupSetting,
  SpeakLanguage,
} from '@/types';
import {
  SPEAK_LANGUAGES,
  SPEAK_PRESET_IDS,
  type SpeakPresetId,
  speakGroupIds,
} from './pronunciationGroups';

export const FLASHCARDS_SPEAK_SETTINGS_DOC = 'flashcardsSpeak';

export const SPEAK_ATTEMPTS_MIN = 1;
export const SPEAK_ATTEMPTS_MAX = 10;
export const DEFAULT_SPEAK_ATTEMPTS = 3;
export const DEFAULT_SPEAK_PRESET: SpeakPresetId = 'beginner';
// Placeholder until S11 calibrates it as the 2nd percentile of native clips.
export const DEFAULT_UNCLEAR_CONFIDENCE = 0.4;

const GROUP_SETTINGS: readonly SpeakGroupSetting[] = [
  'follow',
  'forgive',
  'require',
];

type LanguageDefaults = NonNullable<
  FlashcardsSpeakAdminConfig['languages'][SpeakLanguage]
>;

const perLanguage = (
  build: (language: SpeakLanguage) => LanguageDefaults
): FlashcardsSpeakAdminConfig['languages'] => {
  const out: FlashcardsSpeakAdminConfig['languages'] = {};
  for (const language of SPEAK_LANGUAGES) out[language] = build(language);
  return out;
};

export const DEFAULT_FLASHCARDS_SPEAK_ADMIN_CONFIG: FlashcardsSpeakAdminConfig =
  {
    languages: perLanguage(() => ({
      preset: DEFAULT_SPEAK_PRESET,
      groups: {},
    })),
    attempts: DEFAULT_SPEAK_ATTEMPTS,
    unclearConfidence: DEFAULT_UNCLEAR_CONFIDENCE,
  };

const asRecord = (raw: unknown): Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};

const isPreset = (value: unknown): value is SpeakPresetId =>
  typeof value === 'string' &&
  (SPEAK_PRESET_IDS as readonly string[]).includes(value);

const isGroupSetting = (value: unknown): value is SpeakGroupSetting =>
  typeof value === 'string' &&
  (GROUP_SETTINGS as readonly string[]).includes(value);

/** Clamps a tries-per-card count to 1-10, or returns `fallback` when it isn't a number. */
export function clampSpeakAttempts(
  raw: unknown,
  fallback = DEFAULT_SPEAK_ATTEMPTS
): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.min(
    SPEAK_ATTEMPTS_MAX,
    Math.max(SPEAK_ATTEMPTS_MIN, Math.round(raw))
  );
}

function normalizeLanguage(
  language: SpeakLanguage,
  raw: unknown
): LanguageDefaults {
  const src = asRecord(raw);
  const known = new Set(speakGroupIds(language));
  const groups: Partial<Record<string, SpeakGroupSetting>> = {};
  for (const [id, setting] of Object.entries(asRecord(src.groups))) {
    if (known.has(id) && isGroupSetting(setting)) groups[id] = setting;
  }
  return {
    preset: isPreset(src.preset) ? src.preset : DEFAULT_SPEAK_PRESET,
    groups,
  };
}

/** Fills a partial or malformed `admin_settings/flashcardsSpeak` doc with the defaults. */
export function normalizeFlashcardsSpeakAdminConfig(
  raw: unknown
): FlashcardsSpeakAdminConfig {
  const src = asRecord(raw);
  const languages = asRecord(src.languages);
  const unclear = src.unclearConfidence;
  return {
    languages: perLanguage((language) =>
      normalizeLanguage(language, languages[language])
    ),
    attempts: clampSpeakAttempts(src.attempts),
    unclearConfidence:
      typeof unclear === 'number' &&
      Number.isFinite(unclear) &&
      unclear >= 0 &&
      unclear <= 1
        ? unclear
        : DEFAULT_UNCLEAR_CONFIDENCE,
  };
}
