import type {
  ClassRoster,
  FlashcardCard,
  FlashcardMasteryThreshold,
  FlashcardMode,
  FlashcardModeSettings,
  FlashcardScoreVisibility,
  FlashcardSet,
  FlashcardSide,
  FlashcardSpeakSettings,
  FlashcardsSpeakAdminConfig,
  FlashcardTestType,
  SpeakDialect,
  SpeakGroupSetting,
  SpeakPreset,
} from '@/types';
import {
  DEFAULT_SPEAK_DIALECTS,
  SPEAK_DIALECTS,
  SPEAK_PRESET_IDS,
  speakGroupIds,
  speakLanguageOf,
  speakPresetSettings,
} from '@/config/pronunciationGroups';
import {
  DEFAULT_SPEAK_PRESET,
  clampSpeakAttempts,
} from '@/config/flashcardsSpeakAdmin';
import type { CreateFlashcardAssignmentInput } from '@/hooks/useFlashcardAssignments';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import {
  expandClassTargeting,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import {
  expandMixedTargeting,
  type AssignClassesValue,
} from '@/utils/assignTargets';
import {
  buildPeriodGate,
  type EpochWindow,
  type PeriodRoster,
} from '@/utils/periodPlan';

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
  /** Stepper only: session classes narrowed to their picked students (D5b). */
  studentTargetClassIds?: string[];
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
  /** The per-period context's bell lookup; undefined while the flag is off. */
  bellWindow?: (roster: PeriodRoster, date: Date) => EpochWindow | null;
  /** Stepper only: per-class student picks, expanded as mixed targets. */
  classes?: AssignClassesValue;
  /** Stepper Manual: every class starts paused, one class included. */
  manualStart?: boolean;
}): FlashcardAssignSubmission => {
  const rosterIds = visibleRosterIds(args.rosterIds, args.rosters);
  const selectedRosters = args.rosters.filter((roster) =>
    rosterIds.includes(roster.id)
  );
  const periodGate = buildPeriodGate({
    plan: args.targeting.periodPlan,
    rosters: selectedRosters,
    sharedWindow: args.targeting,
    bellWindow: args.bellWindow,
    manualStart: args.manualStart,
  });
  const mixed = args.classes
    ? expandMixedTargeting(
        args.targeting,
        { ...args.classes, classIds: rosterIds },
        args.rosters
      )
    : undefined;
  const expanded =
    mixed?.targeting ??
    expandClassTargeting(args.targeting, {
      rosters: args.rosters,
      selectedRosterIds: rosterIds,
    });
  // A per-period session and its pointers carry no shared window.
  const expandedTargeting = periodGate
    ? { ...expanded, openAt: undefined, closeAt: undefined }
    : expanded;
  const derived = deriveSessionTargetsFromRosters(selectedRosters);
  return {
    rosterIds,
    expandedTargeting,
    ...(mixed ? { studentTargetClassIds: mixed.studentTargetClassIds } : {}),
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
      ...(expandedTargeting.workKind
        ? { workKind: expandedTargeting.workKind }
        : {}),
      ...(periodGate ? { periodGate } : {}),
    },
  };
};

/** True when a roster can reach SSO students (ClassLink or test class). */
export const rosterHasSsoClass = (roster: ClassRoster): boolean =>
  !roster.loadError &&
  (Boolean(roster.classlinkClassId) || Boolean(roster.testClassId));

/** F21: what students read; present means Speak is shown. */
export type FlashcardSpeakStamp = FlashcardSpeakSettings & { locked: boolean };

const SPEAK_PRESETS: readonly SpeakPreset[] = [...SPEAK_PRESET_IDS, 'custom'];
const SPEAK_GROUP_SETTINGS: readonly SpeakGroupSetting[] = [
  'follow',
  'forgive',
  'require',
];

const knownGroups = (
  ids: readonly string[],
  raw: unknown
): Partial<Record<string, SpeakGroupSetting>> => {
  const out: Partial<Record<string, SpeakGroupSetting>> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [id, setting] of Object.entries(raw)) {
    if (
      ids.includes(id) &&
      (SPEAK_GROUP_SETTINGS as readonly unknown[]).includes(setting)
    ) {
      out[id] = setting as SpeakGroupSetting;
    }
  }
  return out;
};

/** F21/F22: the set's Speak settings, else the district defaults; undefined without the flag or language. */
export function buildSpeakStamp(
  set: Pick<FlashcardSet, 'termLanguage' | 'speak'>,
  canSpeak: boolean,
  adminConfig: FlashcardsSpeakAdminConfig,
  lock: boolean
): FlashcardSpeakStamp | undefined {
  if (!canSpeak) return undefined;
  const language = speakLanguageOf(set.termLanguage);
  if (!language) return undefined;
  const allowed = SPEAK_DIALECTS[language];
  const own = set.speak as Partial<FlashcardSpeakSettings> | undefined;
  const picked = Array.isArray(own?.dialects)
    ? allowed.filter((dialect) => own.dialects?.includes(dialect))
    : [];
  const dialects: SpeakDialect[] =
    picked.length > 0 ? picked : [...DEFAULT_SPEAK_DIALECTS[language]];
  const ids = speakGroupIds(language);
  if (own && typeof own === 'object') {
    return {
      dialects,
      preset: SPEAK_PRESETS.includes(own.preset as SpeakPreset)
        ? (own.preset as SpeakPreset)
        : 'custom',
      strict: own.strict === true,
      groups: knownGroups(ids, own.groups),
      attempts: clampSpeakAttempts(own.attempts, adminConfig.attempts),
      example: own.example !== false,
      locked: lock,
    };
  }
  const district = adminConfig.languages[language];
  const preset = district?.preset ?? DEFAULT_SPEAK_PRESET;
  const base = speakPresetSettings(language, preset);
  const overrides = knownGroups(ids, district?.groups);
  return {
    dialects,
    preset: Object.keys(overrides).length > 0 ? 'custom' : preset,
    strict: base.strict,
    groups: { ...base.groups, ...overrides },
    attempts: clampSpeakAttempts(adminConfig.attempts),
    example: true,
    locked: lock,
  };
}

/** Students get card references only alongside a stamp. */
export const speakCardsFor = (
  cards: FlashcardCard[],
  stamp: FlashcardSpeakStamp | undefined
): FlashcardCard[] =>
  stamp
    ? cards
    : cards.map((card) => {
        if (!card.speak) return card;
        const { speak: _speak, ...rest } = card;
        return rest;
      });
