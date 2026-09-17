import type {
  ClassRoster,
  FlashcardMasteryThreshold,
  FlashcardMode,
  FlashcardModeSettings,
  FlashcardScoreVisibility,
  FlashcardSet,
  FlashcardSide,
  FlashcardTestType,
} from '@/types';
import type { CreateFlashcardAssignmentInput } from '@/hooks/useFlashcardAssignments';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import {
  expandClassTargeting,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';

export const FLASHCARD_MC_MIN_CARDS = 4;

export interface FlashcardAssignForm {
  collectSubmission: boolean;
  checkMode: FlashcardMode;
  showFirst: FlashcardSide;
  strict: boolean;
  testTypes: FlashcardTestType[];
  testCount: number | 'all';
  masteryThreshold: FlashcardMasteryThreshold;
  scoreVisibility: FlashcardScoreVisibility;
}

export const DEFAULT_FLASHCARD_ASSIGN_FORM: FlashcardAssignForm = {
  collectSubmission: false,
  checkMode: 'flashcards',
  showFirst: 'term',
  strict: false,
  testTypes: ['mc', 'fib'],
  testCount: 'all',
  masteryThreshold: 3,
  scoreVisibility: 'score',
};

/** Mirrors the player's test count steps: 5s below the deck size, then All. */
export const flashcardTestCountOptions = (
  deckSize: number
): Array<number | 'all'> => {
  if (deckSize < 5) return ['all'];
  const values: Array<number | 'all'> = [];
  for (let count = 5; count < deckSize; count += 5) values.push(count);
  values.push('all');
  return values;
};

export const isMcAvailable = (cardCount: number): boolean =>
  cardCount >= FLASHCARD_MC_MIN_CARDS;

/** Test types that can actually run for this deck (MC needs 4+ cards). */
export const effectiveTestTypes = (
  form: FlashcardAssignForm,
  cardCount: number
): FlashcardTestType[] =>
  isMcAvailable(cardCount)
    ? form.testTypes
    : form.testTypes.filter((type) => type !== 'mc');

const effectiveTestCount = (
  form: FlashcardAssignForm,
  cardCount: number
): number | 'all' =>
  flashcardTestCountOptions(cardCount).includes(form.testCount)
    ? form.testCount
    : 'all';

export const buildFlashcardLockedSettings = (
  form: FlashcardAssignForm,
  cardCount: number
): FlashcardModeSettings => ({
  showFirst: form.showFirst,
  shuffle: false,
  favoritesOnly: false,
  hideMastered: false,
  strict: form.checkMode === 'flashcards' ? false : form.strict,
  testTypes: effectiveTestTypes(form, cardCount),
  testCount: effectiveTestCount(form, cardCount),
});

export type FlashcardAssignFormError = 'no-cards' | 'no-test-types';

export const validateFlashcardAssignForm = (
  form: FlashcardAssignForm,
  cardCount: number
): FlashcardAssignFormError | null => {
  if (cardCount === 0) return 'no-cards';
  if (
    form.collectSubmission &&
    form.checkMode === 'test' &&
    effectiveTestTypes(form, cardCount).length === 0
  ) {
    return 'no-test-types';
  }
  return null;
};

export type FlashcardAssignKindFields = Pick<
  CreateFlashcardAssignmentInput,
  | 'kind'
  | 'checkMode'
  | 'lockedSettings'
  | 'masteryThreshold'
  | 'scoreVisibility'
>;

/** Kind-specific fields; Study omits every Check-only key. */
export const buildFlashcardAssignKindFields = (
  form: FlashcardAssignForm,
  cardCount: number
): FlashcardAssignKindFields => {
  if (!form.collectSubmission) return { kind: 'study' };
  return {
    kind: 'check',
    checkMode: form.checkMode,
    lockedSettings: buildFlashcardLockedSettings(form, cardCount),
    ...(form.checkMode === 'flashcards'
      ? { masteryThreshold: form.masteryThreshold }
      : {}),
    scoreVisibility: form.scoreVisibility,
  };
};

export interface FlashcardAssignSubmission {
  input: CreateFlashcardAssignmentInput;
  rosterIds: string[];
  expandedTargeting: AssignTargetingValue;
}

/** Drops rosters that were deleted or failed to load since they were picked. */
export const visibleRosterIds = (
  rosterIds: string[],
  rosters: ClassRoster[]
): string[] => {
  const visible = new Set(
    rosters.filter((roster) => !roster.loadError).map((roster) => roster.id)
  );
  return rosterIds.filter((id) => visible.has(id));
};

export const buildFlashcardAssignSubmission = (args: {
  set: FlashcardSet;
  form: FlashcardAssignForm;
  rosters: ClassRoster[];
  rosterIds: string[];
  targeting: AssignTargetingValue;
}): FlashcardAssignSubmission => {
  const rosterIds = visibleRosterIds(args.rosterIds, args.rosters);
  const expandedTargeting = expandClassTargeting(args.targeting, {
    rosters: args.rosters,
    selectedRosterIds: rosterIds,
  });
  const derived = deriveSessionTargetsFromRosters(
    args.rosters.filter((roster) => rosterIds.includes(roster.id))
  );
  return {
    rosterIds,
    expandedTargeting,
    input: {
      set: args.set,
      ...buildFlashcardAssignKindFields(args.form, args.set.cards.length),
      classIds: derived.classIds,
      periodNames: derived.periodNames,
      rosterIds: derived.rosterIds,
      targetGroupIds: expandedTargeting.targetGroupIds,
      overridesBySourcedId: expandedTargeting.overridesByKey,
      openAt: expandedTargeting.openAt ?? null,
      closeAt: expandedTargeting.closeAt ?? null,
      dueAt: expandedTargeting.dueAt ?? null,
    },
  };
};

/** True when a roster can reach SSO students (ClassLink or test class). */
export const rosterHasSsoClass = (roster: ClassRoster): boolean =>
  !roster.loadError &&
  (Boolean(roster.classlinkClassId) || Boolean(roster.testClassId));
