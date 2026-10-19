import type {
  FlashcardSpeakSettings,
  SpeakDialect,
  SpeakGroupSetting,
  SpeakLanguage,
  SpeakPreset,
} from '@/types';

// Flashcards Speak sound groups, tolerance pairs and presets (docs/multilingual-pronunciation-engine.md §4.2-4.3).

/** A target token heard as a spoken token; `final` applies only at the last position. */
export interface PronunciationPair {
  target: string;
  spoken: string;
  final?: true;
}

/** Labels live in `flashcards.speak.groups.<id>`; `stress` has no pairs and is judged per §4.1. */
export interface PronunciationGroup {
  id: string;
  pairs: readonly PronunciationPair[];
}

export const SPEAK_LANGUAGES: readonly SpeakLanguage[] = ['es', 'de', 'en'];

export const SPEAK_DIALECTS: Readonly<
  Record<SpeakLanguage, readonly SpeakDialect[]>
> = {
  es: ['es-419', 'es-ES'],
  de: ['de-DE'],
  en: ['en-US'],
};

/** F4: dialects a new set accepts by default. */
export const DEFAULT_SPEAK_DIALECTS: Readonly<
  Record<SpeakLanguage, readonly SpeakDialect[]>
> = SPEAK_DIALECTS;

export const STRESS_GROUP_ID = 'stress';

const pairs = (...list: Array<[string, string]>): PronunciationPair[] =>
  list.map(([target, spoken]) => ({ target, spoken }));

const finalPairs = (...list: Array<[string, string]>): PronunciationPair[] =>
  list.map(([target, spoken]) => ({ target, spoken, final: true }));

const withReverse = (...list: Array<[string, string]>): PronunciationPair[] =>
  pairs(...list, ...list.map(([a, b]): [string, string] => [b, a]));

const stressGroup: PronunciationGroup = { id: STRESS_GROUP_ID, pairs: [] };

export const PRONUNCIATION_GROUPS: Readonly<
  Record<SpeakLanguage, readonly PronunciationGroup[]>
> = {
  es: [
    { id: 'es-trill', pairs: pairs(['r', 'ɾ'], ['r', 'ɹ']) },
    { id: 'es-tap', pairs: pairs(['ɾ', 'ɹ'], ['ɾ', 'd']) },
    {
      id: 'es-soft-bdg',
      pairs: withReverse(['β', 'b'], ['ð', 'd'], ['ɣ', 'ɡ']),
    },
    {
      id: 'es-aspiration',
      pairs: pairs(['p', 'pʰ'], ['t', 'tʰ'], ['k', 'kʰ']),
    },
    { id: 'es-vowel-glide', pairs: pairs(['e', 'eɪ'], ['o', 'oʊ']) },
    {
      id: 'es-vowel-reduce',
      pairs: pairs(['a', 'ə'], ['e', 'ə'], ['o', 'ə']),
    },
    { id: 'es-jota', pairs: pairs(['x', 'h']) },
    stressGroup,
  ],
  de: [
    { id: 'de-r', pairs: pairs(['ʁ', 'r'], ['ʁ', 'ɹ'], ['ʁ', 'ɾ']) },
    {
      id: 'de-ich-ach',
      pairs: pairs(['ç', 'ʃ'], ['ç', 'x'], ['x', 'k'], ['x', 'h']),
    },
    {
      id: 'de-umlaut',
      pairs: pairs(
        ['y', 'u'],
        ['y', 'i'],
        ['yː', 'uː'],
        ['yː', 'iː'],
        ['ø', 'o'],
        ['ø', 'e'],
        ['øː', 'oː'],
        ['øː', 'eː'],
        ['œ', 'ɔ'],
        ['œ', 'ɛ']
      ),
    },
    {
      id: 'de-vowel-length',
      pairs: withReverse(
        ['aː', 'a'],
        ['eː', 'ɛ'],
        ['iː', 'ɪ'],
        ['oː', 'ɔ'],
        ['uː', 'ʊ']
      ),
    },
    { id: 'de-final', pairs: finalPairs(['t', 'd'], ['p', 'b'], ['k', 'ɡ']) },
    {
      id: 'de-endings',
      pairs: pairs(['ɐ', 'ɜ'], ['ɐ', 'ɜː'], ['ə', 'ɛ'], ['ə', 'e']),
    },
    stressGroup,
  ],
  en: [
    {
      id: 'en-th',
      pairs: pairs(['θ', 't'], ['θ', 'f'], ['θ', 's'], ['ð', 'd'], ['ð', 'z']),
    },
    { id: 'en-r', pairs: pairs(['ɹ', 'ɾ'], ['ɹ', 'r'], ['ɹ', 'ʁ']) },
    {
      id: 'en-aspiration',
      pairs: pairs(['pʰ', 'p'], ['tʰ', 't'], ['kʰ', 'k']),
    },
    {
      id: 'en-vowel-length',
      pairs: pairs(['iː', 'ɪ'], ['ɪ', 'iː'], ['uː', 'ʊ'], ['ʊ', 'uː']),
    },
    { id: 'en-reduced', pairs: pairs(['ə', 'ʌ'], ['ə', 'ɐ'], ['ɚ', 'ɜː']) },
    {
      id: 'en-final-voicing',
      pairs: finalPairs(['z', 's'], ['d', 't'], ['v', 'f']),
    },
    stressGroup,
  ],
};

/** Always correct, never shown or tallied (§4.2). S11 may add pairs only with Paul's yes. */
export const RECOGNIZER_TOLERANCE: Readonly<
  Record<SpeakLanguage, readonly PronunciationPair[]>
> = {
  es: [
    ...pairs(['ɾ', 'r']),
    ...withReverse(['ʝ', 'j'], ['j', 'ʎ'], ['ʝ', 'ʎ']),
  ],
  de: [],
  en: [],
};

export type SpeakPresetId = Exclude<SpeakPreset, 'custom'>;

export const SPEAK_PRESET_IDS: readonly SpeakPresetId[] = [
  'beginner',
  'intermediate',
  'advanced',
];

/** Groups each preset forgives; every other group of the language is required (§4.3). */
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
    'en-aspiration',
    'en-final-voicing',
    'en-reduced',
    STRESS_GROUP_ID,
  ]),
  intermediate: new Set([
    'es-aspiration',
    'es-soft-bdg',
    'de-endings',
    'en-aspiration',
    'en-final-voicing',
    'en-reduced',
    STRESS_GROUP_ID,
  ]),
};

export const presetForgiveIds = (
  preset: Exclude<SpeakPresetId, 'advanced'>
): ReadonlySet<string> => PRESET_FORGIVE[preset];

/** A preset's Strict switch and an explicit setting for every group of the language. */
export function speakPresetSettings(
  language: SpeakLanguage,
  preset: SpeakPresetId
): Pick<FlashcardSpeakSettings, 'strict' | 'groups'> {
  const groups: Record<string, SpeakGroupSetting> = {};
  for (const group of PRONUNCIATION_GROUPS[language]) {
    groups[group.id] =
      preset === 'advanced'
        ? 'follow'
        : PRESET_FORGIVE[preset].has(group.id)
          ? 'forgive'
          : 'require';
  }
  return { strict: preset === 'advanced', groups };
}

export const speakGroupIds = (language: SpeakLanguage): string[] =>
  PRONUNCIATION_GROUPS[language].map((group) => group.id);

export const isSpeakLanguage = (value: string): value is SpeakLanguage =>
  (SPEAK_LANGUAGES as readonly string[]).includes(value);

/** F2: Speak is offered when the primary subtag of `termLanguage` is es, de or en. */
export function speakLanguageOf(
  termLanguage: string | null | undefined
): SpeakLanguage | null {
  const primary = (termLanguage ?? '').trim().split(/[-_]/)[0].toLowerCase();
  return isSpeakLanguage(primary) ? primary : null;
}
