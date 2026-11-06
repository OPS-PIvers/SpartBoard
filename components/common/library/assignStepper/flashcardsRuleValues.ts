// Flashcards Check rules on Quiz's rule steps (Flashcards and Quiz alignment, slice 2).
import type {
  FlashcardCheckRules,
  FlashcardCheckSessionOptions,
  FlashcardPublishedVisibility,
  QuizBehaviorSettings,
  QuizScoreVisibility,
} from '@/types';
import {
  QUIZ_TIME_LIMIT_MAX_MINUTES,
  QUIZ_TIME_LIMIT_MIN_MINUTES,
} from '@/utils/quizTimeLimit';
import {
  TAB_WARNING_THRESHOLD_MAX,
  TAB_WARNING_THRESHOLD_MIN,
} from '@/utils/tabWarningThreshold';
import {
  TAB_AWAY_LIMIT_MAX_SECONDS,
  TAB_AWAY_LIMIT_MIN_SECONDS,
} from '@/utils/tabAwayLimit';
import { isFocusLevel } from '@/utils/pageProtections';
import { flashcardClassVisibility } from '@/utils/flashcardResultsVisibility';

const BOOLEAN_KEYS = [
  'shuffleQuestions',
  'tabWarningsEnabled',
  'tabAwayAutoSubmit',
  'blockCopyPaste',
  'blockPrint',
  'showScoreOnSubmit',
  'showResultToStudent',
  'showCorrectAnswerToStudent',
  'handRaiseEnabled',
] as const satisfies readonly (keyof FlashcardCheckSessionOptions)[];

/** Quiz's defaults, with the score shown on submit as Flashcards always did. */
export const DEFAULT_FLASHCARD_CHECK_RULES: FlashcardCheckRules = {
  attemptLimit: 1,
  sessionOptions: {
    shuffleQuestions: false,
    tabWarningsEnabled: true,
    blockCopyPaste: false,
    showScoreOnSubmit: true,
    showResultToStudent: false,
    showCorrectAnswerToStudent: false,
  },
};

const inRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Keeps only well-typed rules; anything else falls back to the defaults. */
export function parseFlashcardCheckRules(
  raw: unknown
): FlashcardCheckRules | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const limit = r.attemptLimit;
  const attemptLimit =
    limit === null || (typeof limit === 'number' && inRange(limit, 1, 1000))
      ? limit
      : DEFAULT_FLASHCARD_CHECK_RULES.attemptLimit;
  const o =
    r.sessionOptions && typeof r.sessionOptions === 'object'
      ? (r.sessionOptions as Record<string, unknown>)
      : {};
  const sessionOptions: FlashcardCheckSessionOptions = {
    ...DEFAULT_FLASHCARD_CHECK_RULES.sessionOptions,
  };
  for (const key of BOOLEAN_KEYS) {
    const v = o[key];
    if (typeof v === 'boolean') sessionOptions[key] = v;
  }
  if (
    inRange(
      o.timeLimitMinutes,
      QUIZ_TIME_LIMIT_MIN_MINUTES,
      QUIZ_TIME_LIMIT_MAX_MINUTES
    )
  )
    sessionOptions.timeLimitMinutes = o.timeLimitMinutes;
  const threshold = o.tabWarningThreshold;
  if (
    threshold === 'off' ||
    inRange(threshold, TAB_WARNING_THRESHOLD_MIN, TAB_WARNING_THRESHOLD_MAX)
  )
    sessionOptions.tabWarningThreshold = threshold;
  if (
    inRange(
      o.tabAwayLimitSeconds,
      TAB_AWAY_LIMIT_MIN_SECONDS,
      TAB_AWAY_LIMIT_MAX_SECONDS
    )
  )
    sessionOptions.tabAwayLimitSeconds = o.tabAwayLimitSeconds;
  if (isFocusLevel(o.focusLevel)) sessionOptions.focusLevel = o.focusLevel;
  return { attemptLimit, sessionOptions };
}

/** Seeds the switches from an older saved score visibility. */
export function rulesFromScoreVisibility(
  visibility: FlashcardPublishedVisibility
): FlashcardCheckRules {
  const level = flashcardClassVisibility(visibility);
  const answers = level === 'score-responses-and-answers';
  return {
    ...DEFAULT_FLASHCARD_CHECK_RULES,
    sessionOptions: {
      ...DEFAULT_FLASHCARD_CHECK_RULES.sessionOptions,
      showScoreOnSubmit: level !== 'none',
      showResultToStudent: answers || level === 'score-and-responses',
      showCorrectAnswerToStudent: answers,
    },
  };
}

/** The class results level the What students see switches stand for, in Quiz's terms. */
export function scoreVisibilityFromRules(
  rules: FlashcardCheckRules
): QuizScoreVisibility {
  const o = rules.sessionOptions;
  if (!o.showScoreOnSubmit) return 'none';
  if (!o.showResultToStudent) return 'score-only';
  return o.showCorrectAnswerToStudent
    ? 'score-responses-and-answers'
    : 'score-and-responses';
}

/** The rules as Quiz's behavior shape, so Quiz's rule steps edit them directly. */
export const flashcardRulesToBehavior = (
  rules: FlashcardCheckRules
): QuizBehaviorSettings => ({
  sessionMode: 'student',
  attemptLimit: rules.attemptLimit,
  // Test always shuffles multiple-choice options; false keeps the summary from naming them.
  sessionOptions: { ...rules.sessionOptions, shuffleAnswerOptions: false },
});

/** Back from Quiz's behavior shape, keeping only the keys Flashcards stamps. */
export const behaviorToFlashcardRules = (
  behavior: QuizBehaviorSettings
): FlashcardCheckRules => {
  const o = behavior.sessionOptions;
  const sessionOptions: FlashcardCheckSessionOptions = {};
  for (const key of BOOLEAN_KEYS) {
    if (o[key] !== undefined) sessionOptions[key] = o[key];
  }
  if (o.timeLimitMinutes != null)
    sessionOptions.timeLimitMinutes = o.timeLimitMinutes;
  if (o.tabWarningThreshold !== undefined)
    sessionOptions.tabWarningThreshold = o.tabWarningThreshold;
  if (o.tabAwayLimitSeconds !== undefined)
    sessionOptions.tabAwayLimitSeconds = o.tabAwayLimitSeconds;
  if (o.focusLevel !== undefined) sessionOptions.focusLevel = o.focusLevel;
  return { attemptLimit: behavior.attemptLimit, sessionOptions };
};
