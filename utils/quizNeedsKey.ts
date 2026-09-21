/**
 * The single answer to "is this question still missing its key?"
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D5–D7). Import validation, the editor's
 * save, the library badge and the Assign/live/PLC gates all read it here so
 * they cannot drift into disagreeing about which quizzes are incomplete.
 */

import { isFreeResponseType, type QuizData, type QuizQuestion } from '@/types';

/**
 * True when the question was imported without a key and nobody has supplied
 * one since. Free-response has no key by design, so it never counts. A
 * `correctAnswer` typed in afterwards clears the flag on its own, so a stale
 * `needsKey: true` left on a filled-in question can't block a teacher.
 */
export function questionNeedsKey(q: QuizQuestion): boolean {
  if (!q.needsKey) return false;
  if (isFreeResponseType(q.type)) return false;
  return !q.correctAnswer?.trim();
}

/** How many of these questions still need a key. */
export function countQuestionsNeedingKey(
  questions: readonly QuizQuestion[]
): number {
  return questions.reduce((n, q) => (questionNeedsKey(q) ? n + 1 : n), 0);
}

/** Drops `needsKey` once a key exists, so the flag never outlives the gap. */
export function clearSatisfiedNeedsKey(quiz: QuizData): QuizData {
  let changed = false;
  const questions = quiz.questions.map((q) => {
    if (!q.needsKey || questionNeedsKey(q)) return q;
    changed = true;
    const { needsKey: _needsKey, ...rest } = q;
    return rest;
  });
  return changed ? { ...quiz, questions } : quiz;
}
