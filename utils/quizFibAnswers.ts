/**
 * Translated FIB answer keys (PR4). Snapshotted onto the teacher-owned
 * assignment doc at assign time — never onto the world-readable session doc
 * and never into the Drive quiz body, which would invalidate the source hash.
 */

import type { QuizQuestion, QuizTranslation } from '@/types';

/** `{ [questionId]: { [locale]: acceptedAnswers } }`. */
export type LocalizedFibAnswers = Record<string, Record<string, string[]>>;

/**
 * Mirrors the publish gate: only a reviewed AND fresh sidecar entry is
 * snapshotted, so a stale or unreviewed translation is never graded against.
 */
export function collectLocalizedFibAnswers(
  questions: QuizQuestion[],
  byLocale: Record<string, QuizTranslation>,
  freshQuestionIdsByLocale: Record<string, ReadonlySet<string>>
): LocalizedFibAnswers {
  const out: LocalizedFibAnswers = {};
  for (const q of questions) {
    if (q.type !== 'FIB') continue;
    for (const [locale, translation] of Object.entries(byLocale ?? {})) {
      const answer = translation.questions?.[q.id]?.answer;
      if (!answer || !answer.trim()) continue;
      if (!translation.reviewedQuestionIds?.includes(q.id)) continue;
      if (!freshQuestionIdsByLocale?.[locale]?.has(q.id)) continue;
      out[q.id] = { ...(out[q.id] ?? {}), [locale]: [answer] };
    }
  }
  return out;
}

/** Every locale's accepted answers for one question, flattened. Never throws. */
export function fibAcceptedAnswers(
  map: LocalizedFibAnswers | null | undefined,
  questionId: string
): string[] {
  const byLocale = map?.[questionId];
  if (!byLocale) return [];
  return Object.values(byLocale)
    .flat()
    .filter((a): a is string => typeof a === 'string' && a.trim() !== '');
}
