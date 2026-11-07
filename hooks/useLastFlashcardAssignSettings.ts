import type {
  FlashcardCheckRules,
  FlashcardSpeakChoice,
  SpeakPreset,
  FlashcardMasteryThreshold,
  FlashcardMode,
  FlashcardScoreVisibility,
  FlashcardSide,
  FlashcardTestType,
} from '@/types';
import {
  DEFAULT_FLASHCARD_ASSIGN_FORM,
  flashcardTestCountOptions,
  type FlashcardAssignForm,
} from '@/components/widgets/Flashcards/utils/flashcardAssign';
import {
  resetLastAssignSettingsCache,
  useLastAssignSettings,
  type LastAssignSettings,
  type LastAssignSettingsSpec,
} from '@/hooks/useLastAssignSettings';
import { SPEAK_PRESET_IDS } from '@/config/pronunciationGroups';
import { clampSpeakAttempts } from '@/config/flashcardsSpeakAdmin';
import { parseFlashcardCheckRules } from '@/components/common/library/assignStepper/flashcardsRuleValues';

/** Profile field holding this teacher's last-used Flashcards check rules (plan D12). */
export const LAST_FLASHCARD_ASSIGN_SETTINGS_FIELD =
  'lastFlashcardAssignSettings';

/** The "How students are checked" rules; the work/resource switch is not remembered. */
export type FlashcardAssignRules = Omit<
  FlashcardAssignForm,
  'collectSubmission'
> & {
  /** The Quiz-style rule steps; absent on settings saved before them. */
  rules?: FlashcardCheckRules;
  /** Last Speak rules picked; groups aren't kept since they depend on the language. */
  speak?: LastSpeakChoice;
};

/** Groups are kept only for a Custom level, and reused only when they fit the next set's language. */
export type LastSpeakChoice = Omit<FlashcardSpeakChoice, 'groups'> &
  Partial<Pick<FlashcardSpeakChoice, 'groups'>>;

const PRESETS: readonly SpeakPreset[] = [...SPEAK_PRESET_IDS, 'custom'];

const parseLastSpeak = (raw: unknown): LastSpeakChoice | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (
    !PRESETS.includes(r.preset as SpeakPreset) ||
    typeof r.strict !== 'boolean' ||
    typeof r.attempts !== 'number' ||
    typeof r.example !== 'boolean'
  ) {
    return null;
  }
  return {
    preset: r.preset as SpeakPreset,
    strict: r.strict,
    attempts: clampSpeakAttempts(r.attempts),
    example: r.example,
    ...(r.preset === 'custom' &&
    r.groups &&
    typeof r.groups === 'object' &&
    !Array.isArray(r.groups)
      ? { groups: r.groups }
      : {}),
  };
};

const MODES: readonly FlashcardMode[] = [
  'flashcards',
  'write',
  'test',
  'speak',
];
const SIDES: readonly FlashcardSide[] = ['term', 'definition'];
const TEST_TYPES: readonly FlashcardTestType[] = ['mc', 'fib'];
const THRESHOLDS: readonly FlashcardMasteryThreshold[] = [2, 3, 4];
const VISIBILITIES: readonly FlashcardScoreVisibility[] = [
  'none',
  'score',
  'score-and-answers',
];

const pick = <T>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Keeps each well-typed rule and falls back to today's default for the rest. */
export function parseLastFlashcardAssignSettings(
  raw: unknown
): FlashcardAssignRules | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const d = DEFAULT_FLASHCARD_ASSIGN_FORM;
  const testTypes = Array.isArray(r.testTypes)
    ? TEST_TYPES.filter((type) => (r.testTypes as unknown[]).includes(type))
    : [];
  const testCount =
    r.testCount === 'all' ||
    (typeof r.testCount === 'number' &&
      Number.isInteger(r.testCount) &&
      r.testCount > 0)
      ? r.testCount
      : d.testCount;
  return {
    checkMode: pick(MODES, r.checkMode, d.checkMode),
    showFirst: pick(SIDES, r.showFirst, d.showFirst),
    strict: typeof r.strict === 'boolean' ? r.strict : d.strict,
    testTypes: testTypes.length > 0 ? testTypes : [...d.testTypes],
    testCount,
    masteryThreshold: pick(THRESHOLDS, r.masteryThreshold, d.masteryThreshold),
    scoreVisibility: pick(VISIBILITIES, r.scoreVisibility, d.scoreVisibility),
    ...(r.rules !== undefined
      ? (() => {
          const rules = parseFlashcardCheckRules(r.rules);
          return rules ? { rules } : {};
        })()
      : {}),
    ...(() => {
      const speak = parseLastSpeak(r.speak);
      return speak ? { speak } : {};
    })(),
  };
}

/** The form to open with: last-used rules over today's defaults, test count reset when this deck can't use it. */
export function getFlashcardAssignPrefill(
  lastUsed: FlashcardAssignRules | null,
  deckSize: number
): FlashcardAssignForm & Pick<FlashcardAssignRules, 'rules'> {
  const { speak: _speak, ...saved } = lastUsed ?? {};
  const form: FlashcardAssignForm & Pick<FlashcardAssignRules, 'rules'> = {
    ...DEFAULT_FLASHCARD_ASSIGN_FORM,
    ...saved,
  };
  if (!flashcardTestCountOptions(deckSize).includes(form.testCount)) {
    form.testCount = 'all';
  }
  return form;
}

const FLASHCARD_SPEC: LastAssignSettingsSpec<FlashcardAssignRules> = {
  field: LAST_FLASHCARD_ASSIGN_SETTINGS_FIELD,
  parse: parseLastFlashcardAssignSettings,
  logTag: 'useLastFlashcardAssignSettings',
};

/** Test hook: forget cached reads between cases. */
export function resetLastFlashcardAssignSettingsCache(): void {
  resetLastAssignSettingsCache(LAST_FLASHCARD_ASSIGN_SETTINGS_FIELD);
}

/** Reads and writes the teacher's last-used Flashcards check rules; inert when `enabled` is false. */
export function useLastFlashcardAssignSettings(
  uid: string | null | undefined,
  enabled: boolean
): LastAssignSettings<FlashcardAssignRules> {
  return useLastAssignSettings(FLASHCARD_SPEC, uid, enabled);
}
