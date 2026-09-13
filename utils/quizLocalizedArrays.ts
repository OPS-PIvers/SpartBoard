/**
 * The one place a choice-bearing array is reordered or filtered (plan §4.4).
 * English strings and every locale's sibling array move together or not at all.
 */

import type { LocalizedQuestionStrings, QuizPublicQuestion } from '@/types';

/** Fields the projection and the seeded shuffle may permute. `matchingLeft` is deliberately absent. */
export type ReindexableField = 'choices' | 'matchingRight' | 'orderingItems';

/**
 * Apply ONE index operation — a permutation or a kept subset — to `field` on
 * the English question AND to the same field on every locale, in lockstep.
 *
 * `matchingLeft` is not in the union: nothing permutes it, and permuting it
 * would break the pair semantics `MatchingResponseInput` writes its answer from.
 *
 * Identity fast path when the English array or `q.localized` is absent.
 */
export function reindexChoiceArray(
  q: QuizPublicQuestion,
  field: ReindexableField,
  indices: number[]
): QuizPublicQuestion {
  const source = q[field];
  if (!source) return q;
  const next: QuizPublicQuestion = {
    ...q,
    [field]: indices.map((i) => source[i]),
  };
  if (!q.localized) return next;
  const localized: Record<string, LocalizedQuestionStrings> = {};
  for (const [locale, strings] of Object.entries(q.localized)) {
    const labels = strings[field];
    // Length re-check is the last line of defence: an array that is not
    // index-aligned is left alone rather than reordered against the wrong keys.
    localized[locale] =
      labels && labels.length === source.length
        ? { ...strings, [field]: indices.map((i) => labels[i]) }
        : strings;
  }
  next.localized = localized;
  return next;
}
