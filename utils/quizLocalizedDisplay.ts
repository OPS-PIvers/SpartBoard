/**
 * Display-only overlay of a locale's strings onto a public question (§4.6).
 * The English arrays stay on the returned object so `toCanonicalAnswer` and
 * grading keep working; only the rendered strings change, and only when the
 * locale array is lockstep with its English sibling.
 */

import type { LocalizedQuestionStrings, QuizPublicQuestion } from '@/types';

type ArrayField =
  | 'choices'
  | 'matchingLeft'
  | 'matchingRight'
  | 'orderingItems';

const ARRAY_FIELDS: ArrayField[] = [
  'choices',
  'matchingLeft',
  'matchingRight',
  'orderingItems',
];

/**
 * A question whose rendered strings are `strings`, or the question unchanged
 * when `strings` is null. Never returns arrays of a different length than the
 * English ones it replaces — a mismatch falls back to English for that field.
 */
export function applyLocalizedStrings(
  q: QuizPublicQuestion,
  strings: LocalizedQuestionStrings | null
): QuizPublicQuestion {
  if (!strings) return q;
  const next: QuizPublicQuestion = { ...q };
  if (strings.text) next.text = strings.text;
  for (const field of ARRAY_FIELDS) {
    const english = q[field];
    const localized = strings[field];
    if (english && localized && english.length === localized.length) {
      next[field] = localized;
    }
  }
  if (strings.placeholder) next.placeholder = strings.placeholder;
  if (strings.rubricSnapshot && q.rubricSnapshot)
    next.rubricSnapshot = strings.rubricSnapshot;
  return next;
}
