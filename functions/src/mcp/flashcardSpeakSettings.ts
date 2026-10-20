// Pure Flashcards Speak settings for the connector (S10); no Firebase imports so root parity tests can load it.
import type {
  FlashcardCardSpeak,
  SpeakDialect,
  SpeakLanguage,
} from '../pronunciation/types';

export type SpeakGroupSetting = 'follow' | 'forgive' | 'require';
export type SpeakPresetId = 'beginner' | 'intermediate' | 'advanced';
type SpeakPreset = SpeakPresetId | 'custom';

/** Server copy of FlashcardSpeakSettings (types.ts). */
export interface SpeakSettings {
  dialects: SpeakDialect[];
  preset: SpeakPreset;
  strict: boolean;
  groups: Partial<Record<string, SpeakGroupSetting>>;
  attempts: number;
  example: boolean;
}

/** What Claude may set; finer group choices stay in the SpartBoard editor. */
export interface SpeakSettingsInput {
  dialects?: SpeakDialect[];
  level?: SpeakPresetId;
  attempts?: number;
  hear_it?: boolean;
}

// Mirrors config/pronunciationGroups.ts and config/flashcardsSpeakAdmin.ts; tests/pronunciation/connectorSpeakParity.test.ts keeps them equal.
export const SPEAK_DIALECTS: Readonly<
  Record<SpeakLanguage, readonly SpeakDialect[]>
> = {
  es: ['es-419', 'es-ES'],
  de: ['de-DE'],
  en: ['en-US'],
};

export const SPEAK_GROUP_IDS: Readonly<
  Record<SpeakLanguage, readonly string[]>
> = {
  es: [
    'es-trill',
    'es-tap',
    'es-soft-bdg',
    'es-aspiration',
    'es-vowel-glide',
    'es-vowel-reduce',
    'es-jota',
    'stress',
  ],
  de: [
    'de-r',
    'de-ich-ach',
    'de-umlaut',
    'de-vowel-length',
    'de-final',
    'de-endings',
    'stress',
  ],
  en: [
    'en-th',
    'en-r',
    'en-vowel-length',
    'en-reduced',
    'en-final-voicing',
    'stress',
  ],
};

const PRESET_FORGIVE: Readonly<
  Record<Exclude<SpeakPresetId, 'advanced'>, ReadonlySet<string>>
> = {
  beginner: new Set([
    'es-trill',
    'es-tap',
    'es-aspiration',
    'es-soft-bdg',
    'es-jota',
    'de-r',
    'de-ich-ach',
    'de-final',
    'de-endings',
    'en-r',
    'en-th',
    'en-final-voicing',
    'en-reduced',
    'stress',
  ]),
  intermediate: new Set([
    'es-aspiration',
    'es-soft-bdg',
    'de-endings',
    'en-final-voicing',
    'en-reduced',
    'stress',
  ]),
};

export const SPEAK_PRESET_IDS: readonly SpeakPresetId[] = [
  'beginner',
  'intermediate',
  'advanced',
];
const SPEAK_PRESETS: readonly SpeakPreset[] = [...SPEAK_PRESET_IDS, 'custom'];
const GROUP_SETTINGS: readonly SpeakGroupSetting[] = [
  'follow',
  'forgive',
  'require',
];
export const DEFAULT_SPEAK_ATTEMPTS = 3;
const DEFAULT_SPEAK_PRESET: SpeakPresetId = 'beginner';
export const DEFAULT_UNCLEAR_CONFIDENCE = 0.4;

export function speakPresetSettings(
  language: SpeakLanguage,
  preset: SpeakPresetId
): Pick<SpeakSettings, 'strict' | 'groups'> {
  const groups: Record<string, SpeakGroupSetting> = {};
  for (const id of SPEAK_GROUP_IDS[language]) {
    groups[id] =
      preset === 'advanced'
        ? 'follow'
        : PRESET_FORGIVE[preset].has(id)
          ? 'forgive'
          : 'require';
  }
  return { strict: preset === 'advanced', groups };
}

export function speakLanguageOf(termLanguage: unknown): SpeakLanguage | null {
  const primary =
    typeof termLanguage === 'string'
      ? termLanguage.trim().split(/[-_]/)[0].toLowerCase()
      : '';
  return primary === 'es' || primary === 'de' || primary === 'en'
    ? primary
    : null;
}

export const asRecord = (raw: unknown): Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};

export function clampSpeakAttempts(
  raw: unknown,
  fallback = DEFAULT_SPEAK_ATTEMPTS
): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.min(10, Math.max(1, Math.round(raw)));
}

const knownGroups = (
  language: SpeakLanguage,
  raw: unknown
): Partial<Record<string, SpeakGroupSetting>> => {
  const out: Partial<Record<string, SpeakGroupSetting>> = {};
  for (const [id, setting] of Object.entries(asRecord(raw))) {
    if (
      SPEAK_GROUP_IDS[language].includes(id) &&
      (GROUP_SETTINGS as readonly unknown[]).includes(setting)
    ) {
      out[id] = setting as SpeakGroupSetting;
    }
  }
  return out;
};

const isPresetId = (value: unknown): value is SpeakPresetId =>
  (SPEAK_PRESET_IDS as readonly unknown[]).includes(value);

export interface SpeakAdminDefaults {
  languages: Partial<
    Record<
      SpeakLanguage,
      {
        preset: SpeakPresetId;
        groups: Partial<Record<string, SpeakGroupSetting>>;
      }
    >
  >;
  attempts: number;
  /** 0-1; stamped for students, never saved on the set. */
  unclearConfidence: number;
}

/** Mirrors normalizeFlashcardsSpeakAdminConfig (config/flashcardsSpeakAdmin.ts). */
export function normalizeSpeakAdminDefaults(raw: unknown): SpeakAdminDefaults {
  const src = asRecord(raw);
  const languages = asRecord(src.languages);
  const out: SpeakAdminDefaults['languages'] = {};
  for (const language of ['es', 'de', 'en'] as const) {
    const entry = asRecord(languages[language]);
    out[language] = {
      preset: isPresetId(entry.preset) ? entry.preset : DEFAULT_SPEAK_PRESET,
      groups: knownGroups(language, entry.groups),
    };
  }
  const unclear = src.unclearConfidence;
  return {
    languages: out,
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

/** Mirrors buildSpeakStamp (components/widgets/Flashcards/utils/flashcardAssign.ts) without the lock. */
export function resolveSpeakSettings(
  language: SpeakLanguage,
  own: unknown,
  defaults: SpeakAdminDefaults
): SpeakSettings {
  const allowed = SPEAK_DIALECTS[language];
  const ownRecord =
    typeof own === 'object' && own !== null ? asRecord(own) : null;
  const ownDialects = ownRecord?.dialects;
  const picked = Array.isArray(ownDialects)
    ? allowed.filter((dialect) => ownDialects.includes(dialect))
    : [];
  const dialects = picked.length > 0 ? picked : [...allowed];
  if (ownRecord) {
    return {
      dialects,
      preset: SPEAK_PRESETS.includes(ownRecord.preset as SpeakPreset)
        ? (ownRecord.preset as SpeakPreset)
        : 'custom',
      strict: ownRecord.strict === true,
      groups: knownGroups(language, ownRecord.groups),
      attempts: clampSpeakAttempts(ownRecord.attempts, defaults.attempts),
      example: ownRecord.example !== false,
    };
  }
  const district = defaults.languages[language];
  const preset = district?.preset ?? DEFAULT_SPEAK_PRESET;
  const base = speakPresetSettings(language, preset);
  const overrides = district?.groups ?? {};
  return {
    dialects,
    preset: Object.keys(overrides).length > 0 ? 'custom' : preset,
    strict: base.strict,
    groups: { ...base.groups, ...overrides },
    attempts: clampSpeakAttempts(defaults.attempts),
    example: true,
  };
}

/** Dialects named in a set's own Speak settings belong to `language`. */
export const ownSpeakFits = (
  own: unknown,
  language: SpeakLanguage
): boolean => {
  const dialects = asRecord(own).dialects;
  return (
    Array.isArray(dialects) &&
    dialects.length > 0 &&
    dialects.every((d) => SPEAK_DIALECTS[language].includes(d as SpeakDialect))
  );
};

// Reasons only a dialect with no reference produces.
const NO_REF_REASONS = ['unrenderable', 'untokenizable', 'multi-word'];

/** Mirrors refsFitDialects (components/widgets/Flashcards/speak/speakEditorState.ts); voice refs ride along with their dialect's espeak ref. */
export const refsFitSpeakDialects = (
  speak: FlashcardCardSpeak,
  dialects: readonly SpeakDialect[]
): boolean =>
  speak.refs.every((ref) => dialects.includes(ref.dialect)) &&
  (speak.refs.length === 0 ||
    dialects.every((d) =>
      speak.refs.some((ref) => ref.dialect === d && ref.source !== 'voice')
    ) ||
    // A language has at most two accents, so a recorded failure explains the missing one.
    (speak.reasons ?? []).some((r) => NO_REF_REASONS.includes(r)));
