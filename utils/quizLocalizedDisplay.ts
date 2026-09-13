/**
 * Display-only overlay of a locale's strings onto a public question (§4.6).
 * Returns a render-only clone whose arrays ARE the localized ones — never pass
 * it to `toDisplayAnswer`/`toCanonicalAnswer`, which need the English question.
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

/** The session title in the student's locale, falling back to English (§4.2). */
export function localizedQuizTitle(
  session: { quizTitle: string; quizTitleLocalized?: Record<string, string> },
  locale: string | undefined
): string {
  if (!locale) return session.quizTitle;
  return session.quizTitleLocalized?.[locale] ?? session.quizTitle;
}
