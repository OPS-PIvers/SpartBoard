/**
 * Teacher-side translation of the B2 override editor's structured MC option
 * ids into the literal option TEXT the student side matches on (M17 §5 C3).
 *
 * The B2 editor (`QuizManager.toOverrideEditorQuestions`) labels options
 * `{questionId}-correct` / `{questionId}-incorrect-{i}` so the UI can mark the
 * key. Those ids must never reach `/student_assignments` — an id encoding
 * `-correct` on a student-readable pointer doc is an answer-key leak. The
 * teacher client holds the full quiz body at save time, so it resolves each id
 * to its option text here and the pointer doc carries text only.
 */

import type { QuizQuestion, StudentOverride } from '@/types';

export interface HiddenOptionTranslationResult {
  overridesByKey: Record<string, StudentOverride>;
  /** Teacher-facing messages for options that could not be hidden. */
  warnings: string[];
}

function buildOptionTextById(question: QuizQuestion): Map<string, string> {
  const byId = new Map<string, string>();
  if (question.type !== 'MC') return byId;
  byId.set(`${question.id}-correct`, question.correctAnswer);
  question.incorrectAnswers.forEach((text, i) => {
    byId.set(`${question.id}-incorrect-${i}`, text);
  });
  return byId;
}

/**
 * Rewrite every `hiddenOptionIdsByQuestion` entry from structured option ids
 * to option texts. Refuses to hide an option whose text equals the question's
 * correct answer (a duplicate-text distractor would take the key down with
 * it), drops unresolvable ids, and dedupes. Questions left with nothing to
 * hide are removed; overrides left with no hidden options drop the field.
 */
export function translateHiddenOptionIdsToText(
  questions: QuizQuestion[],
  overridesByKey: Record<string, StudentOverride>
): HiddenOptionTranslationResult {
  const questionById = new Map(questions.map((q) => [q.id, q] as const));
  const warnings: string[] = [];
  const next: Record<string, StudentOverride> = {};

  for (const [key, override] of Object.entries(overridesByKey)) {
    const source = override.hiddenOptionIdsByQuestion;
    if (!source) {
      next[key] = override;
      continue;
    }
    const translated: Record<string, string[]> = {};
    for (const [questionId, ids] of Object.entries(source)) {
      const question = questionById.get(questionId);
      if (!question) continue;
      const optionTextById = buildOptionTextById(question);
      const texts: string[] = [];
      for (const id of ids) {
        const text = optionTextById.get(id);
        if (text === undefined) continue;
        if (text === question.correctAnswer) {
          warnings.push(
            `"${question.text || questionId}": an answer choice matching the correct answer can't be hidden.`
          );
          continue;
        }
        if (!texts.includes(text)) texts.push(text);
      }
      if (texts.length > 0) translated[questionId] = texts;
    }
    const { hiddenOptionIdsByQuestion: _dropped, ...rest } = override;
    next[key] =
      Object.keys(translated).length > 0
        ? { ...rest, hiddenOptionIdsByQuestion: translated }
        : rest;
  }

  return { overridesByKey: next, warnings: Array.from(new Set(warnings)) };
}
