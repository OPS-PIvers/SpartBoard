/**
 * Student-side application of a `StudentOverride` to a quiz session's public
 * questions (M17 spec §5 C3). Kept out of `QuizStudentApp.tsx` so the subset
 * math is independently unit-testable.
 */

import type { QuizPublicQuestion, StudentOverride } from '@/types';

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
 * text. Trusts the data — hiding the correct answer is prevented at
 * authoring time (B2 UI) and validated server-side (the targeting Cloud
 * Function), not re-checked here.
 */
export function applyHiddenOptions(
  question: QuizPublicQuestion,
  hiddenOptionIdsByQuestion: StudentOverride['hiddenOptionIdsByQuestion']
): QuizPublicQuestion {
  const hidden = hiddenOptionIdsByQuestion?.[question.id];
  if (!hidden || hidden.length === 0 || !question.choices) return question;
  const hiddenSet = new Set(hidden);
  const choices = question.choices.filter((c) => !hiddenSet.has(c));
  if (choices.length === question.choices.length) return question;
  return { ...question, choices };
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
