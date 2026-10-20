// Connector side of Flashcards Speak (docs/multilingual-pronunciation-engine.md S10): settings, save-time lookup, stamps.
import type * as admin from 'firebase-admin';
import {
  computeSpeakReferences,
  FLASHCARDS_SPEAK_FEATURE_ID,
  parseLookupInput,
  SPEAK_G2P_VERSION,
} from '../pronunciation/lookup';
import type {
  FlashcardCardSpeak,
  SpeakDialect,
  SpeakLanguage,
} from '../pronunciation/types';
import { ToolError } from './activity';
import type { FlashcardCard, FlashcardSet } from './flashcardStore';

type Firestore = admin.firestore.Firestore;
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
const ADMIN_DOC = 'admin_settings/flashcardsSpeak';

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

const asRecord = (raw: unknown): Record<string, unknown> =>
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
}

/** Mirrors normalizeFlashcardsSpeakAdminConfig (config/flashcardsSpeakAdmin.ts), minus the student-only cut-off. */
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
  return { languages: out, attempts: clampSpeakAttempts(src.attempts) };
}

/** F22: one read at save time; any failure falls back to the shipped defaults. */
export async function readSpeakAdminDefaults(
  db: Firestore
): Promise<SpeakAdminDefaults> {
  try {
    return normalizeSpeakAdminDefaults((await db.doc(ADMIN_DOC).get()).data());
  } catch (err) {
    console.error('[mcpServer] Speak defaults read failed', { err });
    return normalizeSpeakAdminDefaults(undefined);
  }
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

/** Applies Claude's choices on top of the resolved settings. */
export function applySpeakInput(
  language: SpeakLanguage,
  settings: SpeakSettings,
  input: SpeakSettingsInput
): SpeakSettings {
  const dialects = input.dialects
    ? SPEAK_DIALECTS[language].filter((d) => input.dialects?.includes(d))
    : settings.dialects;
  if (dialects.length === 0) {
    throw new ToolError(
      `Pick accents for this language: ${SPEAK_DIALECTS[language].join(', ')}.`
    );
  }
  return {
    ...settings,
    ...(input.level
      ? { preset: input.level, ...speakPresetSettings(language, input.level) }
      : {}),
    dialects,
    attempts:
      input.attempts === undefined
        ? settings.attempts
        : clampSpeakAttempts(input.attempts, settings.attempts),
    example: input.hear_it ?? settings.example,
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

const sameDialects = (speak: FlashcardCardSpeak, dialects: SpeakDialect[]) =>
  speak.refs.length === 0 ||
  (speak.refs.length === dialects.length &&
    speak.refs.every((ref) => dialects.includes(ref.dialect)));

/** A card's references are current for its term, the engine version and the set's dialects. */
export function cardSpeakCurrent(
  card: FlashcardCard,
  dialects: SpeakDialect[]
): boolean {
  const speak = card.speak as FlashcardCardSpeak | undefined;
  return (
    !!speak &&
    speak.term === card.term &&
    speak.g2pVersion === SPEAK_G2P_VERSION &&
    Array.isArray(speak.refs) &&
    !speak.reasons?.includes('lookup-failed') &&
    sameDialects(speak, dialects)
  );
}

const lookupFailed = (card: FlashcardCard): FlashcardCardSpeak => ({
  term: card.term,
  refs: [],
  g2pVersion: SPEAK_G2P_VERSION,
  status: 'unavailable',
  reasons: ['lookup-failed'],
});

/** Looks up every card whose references are stale; a failed lookup marks those cards so the next save retries. */
export async function attachSpeakReferences(
  cards: FlashcardCard[],
  language: SpeakLanguage,
  dialects: SpeakDialect[],
  compute: typeof computeSpeakReferences = computeSpeakReferences
): Promise<FlashcardCard[]> {
  const stale = cards.filter((card) => !cardSpeakCurrent(card, dialects));
  if (stale.length === 0) return cards;
  let found: Record<string, FlashcardCardSpeak>;
  try {
    const input = parseLookupInput({
      language,
      dialects,
      terms: stale.map((card) => {
        const previous = card.speak as FlashcardCardSpeak | undefined;
        const ipaOverride =
          previous?.term === card.term ? previous.ipaOverride : undefined;
        return {
          cardId: card.id,
          term: card.term,
          ...(ipaOverride ? { ipaOverride } : {}),
        };
      }),
    });
    found = (await compute(input)).cards;
  } catch (err) {
    console.error('[mcpServer] Speak lookup failed', { err });
    found = {};
  }
  const staleIds = new Set(stale.map((card) => card.id));
  return cards.map((card) =>
    staleIds.has(card.id)
      ? {
          ...card,
          speak: keepConfirmation(
            card.speak as FlashcardCardSpeak | undefined,
            found[card.id] ?? lookupFailed(card)
          ) as unknown as Record<string, unknown>,
        }
      : card
  );
}

/** A teacher's confirmation survives a re-lookup that returns the same references. */
const keepConfirmation = (
  previous: FlashcardCardSpeak | undefined,
  next: FlashcardCardSpeak
): FlashcardCardSpeak =>
  previous?.confirmedAt &&
  previous.term === next.term &&
  next.status === 'needs-review' &&
  JSON.stringify(previous.refs) === JSON.stringify(next.refs)
    ? { ...next, confirmedAt: previous.confirmedAt }
    : next;

export interface SpeakCounts {
  ready: number;
  to_check: number;
  unavailable: number;
}

export const countSpeakCards = (cards: FlashcardCard[]): SpeakCounts => {
  const counts: SpeakCounts = { ready: 0, to_check: 0, unavailable: 0 };
  for (const card of cards) {
    const speak = card.speak as FlashcardCardSpeak | undefined;
    if (speak?.status === 'ready') counts.ready += 1;
    else if (speak?.status === 'needs-review' && !speak.confirmedAt) {
      counts.to_check += 1;
    } else if (speak?.status === 'needs-review') counts.ready += 1;
    else counts.unavailable += 1;
  }
  return counts;
};

export interface SpeakSaveResult {
  set: FlashcardSet;
  /** Present when the teacher has Speak and the language supports it (F21 stamp source). */
  stamp?: SpeakSettings;
  counts?: SpeakCounts;
}

/** Server gate, mirrors canAccessFeature('flashcards-speak'). */
export async function speakGranted(
  db: Firestore,
  email: string | null,
  uid: string
): Promise<boolean> {
  const { isGlobalFeatureGranted } = await import('../quizMediaArchive');
  return isGlobalFeatureGranted(db, FLASHCARDS_SPEAK_FEATURE_ID, email, uid);
}

/** Resolves Speak for a connector save: settings (written only when Claude passed some or the set has its own), card lookups and the stamp. */
export async function prepareSpeakSave(
  db: Firestore,
  who: { email: string | null; uid: string },
  set: FlashcardSet,
  input: SpeakSettingsInput | undefined
): Promise<SpeakSaveResult> {
  const language = speakLanguageOf(set.termLanguage);
  if (input && !language) {
    throw new ToolError(
      'Speak works when the term language is Spanish, German or English.'
    );
  }
  const granted =
    language !== null && (await speakGranted(db, who.email, who.uid));
  if (input && !granted) {
    throw new ToolError('Speak is not turned on for this account.');
  }
  if (!language || !granted) return { set };
  const own = ownSpeakFits(set.speak, language) ? set.speak : undefined;
  const defaults = await readSpeakAdminDefaults(db);
  const resolved = resolveSpeakSettings(language, own, defaults);
  const settings = input
    ? applySpeakInput(language, resolved, input)
    : resolved;
  const cards = await attachSpeakReferences(
    set.cards,
    language,
    settings.dialects
  );
  const next: FlashcardSet = { ...set, cards };
  if (input || own) next.speak = settings as unknown as Record<string, unknown>;
  else delete next.speak;
  return { set: next, stamp: settings, counts: countSpeakCards(cards) };
}
