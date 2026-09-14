/**
 * Student-side application of a `StudentOverride` to a quiz session's public
 * questions (M17 spec §5 C3). Kept out of `QuizStudentApp.tsx` so the subset
 * math is independently unit-testable.
 */

import type {
  LocalizedQuestionStrings,
  QuizPublicQuestion,
  StudentOverride,
} from '@/types';
import { isTranslatableQuestionType } from '@/config/quizTranslation';
import { reindexChoiceArray } from './quizLocalizedArrays';

/**
 * Filter `publicQuestions` down to the student's served subset. Preserves
 * the original order; returns the input array unchanged when no subset
 * override is set (the common, unmodified-assignment case).
 */
export function serveQuestionSubset(
  publicQuestions: QuizPublicQuestion[],
  questionIds: string[] | undefined
): QuizPublicQuestion[] {
  if (!questionIds) return publicQuestions;
  const idSet = new Set(questionIds);
  return publicQuestions.filter((q) => idSet.has(q.id));
}

/**
 * Remove hidden MC choices from a served question. `QuizPublicQuestion.choices`
 * carries no stable per-option id (choices are pre-shuffled server-side with
 * the correct answer's identity deliberately unknown), so
 * `StudentOverride.hiddenOptionIdsByQuestion` values are the option's literal
 * text — the teacher client translates the B2 editor's structured option ids
 * to text at save time (`utils/quizHiddenOptions.ts`), which is also where
 * hiding the correct answer is refused. Nothing to re-check here.
 */
export function applyHiddenOptions(
  question: QuizPublicQuestion,
  hiddenOptionIdsByQuestion: StudentOverride['hiddenOptionIdsByQuestion']
): QuizPublicQuestion {
  const hidden = hiddenOptionIdsByQuestion?.[question.id];
  if (!hidden || hidden.length === 0 || !question.choices) return question;
  const hiddenSet = new Set(hidden);
  const kept = question.choices
    .map((c, i) => (hiddenSet.has(c) ? -1 : i))
    .filter((i) => i >= 0);
  if (kept.length === question.choices.length) return question;
  return reindexChoiceArray(question, 'choices', kept);
}

const LOCALIZED_ARRAY_FIELDS = [
  'choices',
  'matchingLeft',
  'matchingRight',
  'orderingItems',
] as const;

/**
 * The active locale's display strings, or `null` to render English. Staleness
 * and review are gated at publish; this rejects what would render half-English.
 */
export function serveLocalizedQuestion(
  q: QuizPublicQuestion,
  locale: string | undefined
): LocalizedQuestionStrings | null {
  if (!locale) return null;
  // Serve nothing for a type excluded from translation (FIB is now included).
  if (!isTranslatableQuestionType(q.type)) return null;
  const entry = q.localized?.[locale];
  if (!entry) return null;
  // Whole-question fallback (§4.6): a translated stem over English options is worse than English.
  for (const field of LOCALIZED_ARRAY_FIELDS) {
    if (q[field]?.length && !entry[field]?.length) return null;
  }
  // Free response: an untranslated rubric or placeholder is the same half-English mix.
  if (q.placeholder && !entry.placeholder) return null;
  if (q.rubricSnapshot && !entry.rubricSnapshot) return null;
  return entry;
}

/**
 * Apply a per-student extended-time multiplier to a question's time limit.
 * `0` (no limit) is always left alone — extending "unlimited" is a no-op.
 */
export function applyTimeMultiplier(
  seconds: number,
  multiplier: StudentOverride['timeMultiplier']
): number {
  if (!seconds || seconds <= 0) return seconds;
  if (multiplier === 'unlimited') return 0;
  if (multiplier === 1.5 || multiplier === 2)
    return Math.round(seconds * multiplier);
  return seconds;
}
