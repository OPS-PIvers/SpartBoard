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

/** A repeated label makes any index mapping ambiguous. */
export const hasDuplicateLabels = (values: string[]): boolean =>
  new Set(values).size !== values.length;

/**
 * Indices that reorder `source` into `target`, or null when they are not the
 * same multiset. A `source` with repeated strings is refused outright: the
 * mapping would be ambiguous and could pair a locale label with the wrong slot.
 */
function matchOrderIndices(
  source: string[] | undefined,
  target: string[] | undefined
): number[] | null {
  if (!source || !target || source.length !== target.length) return null;
  if (hasDuplicateLabels(source)) return null;
  const used = new Array<boolean>(source.length).fill(false);
  const indices: number[] = [];
  for (const value of target) {
    const i = source.findIndex((s, idx) => !used[idx] && s === value);
    if (i < 0) return null;
    used[i] = true;
    indices.push(i);
  }
  return indices;
}

/**
 * Re-apply the order a live session already served to a freshly projected
 * question, so a PLC re-sync never invalidates answers students already picked
 * (plan §11 PR5). A field whose English values changed keeps its fresh shuffle.
 */
export function alignToPreviousOrder(
  fresh: QuizPublicQuestion,
  previous: QuizPublicQuestion | undefined
): QuizPublicQuestion {
  if (!previous) return fresh;
  const fields: ReindexableField[] = [
    'choices',
    'matchingRight',
    'orderingItems',
  ];
  let out = fresh;
  for (const field of fields) {
    const indices = matchOrderIndices(out[field], previous[field]);
    if (indices) out = reindexChoiceArray(out, field, indices);
  }
  return out;
}
