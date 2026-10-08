import type {
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

/** Profile field holding this teacher's last-used Flashcards check rules (plan D12). */
export const LAST_FLASHCARD_ASSIGN_SETTINGS_FIELD =
  'lastFlashcardAssignSettings';

/** The "How students are checked" rules; the work/resource switch is not remembered. */
export type FlashcardAssignRules = Omit<
  FlashcardAssignForm,
  'collectSubmission'
>;

const MODES: readonly FlashcardMode[] = ['flashcards', 'write', 'test'];
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
  };
}

/** The form to open with: last-used rules over today's defaults, test count reset when this deck can't use it. */
export function getFlashcardAssignPrefill(
  lastUsed: FlashcardAssignRules | null,
  deckSize: number
): FlashcardAssignForm {
  const form: FlashcardAssignForm = {
    ...DEFAULT_FLASHCARD_ASSIGN_FORM,
    ...(lastUsed ?? {}),
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
