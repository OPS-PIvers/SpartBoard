/**
 * The conversion boundary between the English canonical answer (what is written
 * to Firestore and graded) and the displayed form the student sees (D36, §4.5).
 * Mapping is by INDEX between the already-lockstep English and localized arrays
 * on the question. Never throws.
 */

import type { LocalizedQuestionStrings, QuizPublicQuestion } from '@/types';

type Direction = 'toDisplay' | 'toCanonical';

let missReported = false;

/** Map one value across a pair of index-aligned arrays; falls back to the input. */
function mapValue(
  value: string,
  english: string[] | undefined,
  labels: string[] | undefined
): string {
  if (!english || !labels || english.length !== labels.length) return value;
  const i = english.indexOf(value);
  if (i >= 0) return labels[i];
  // The value may already be in the target form — accept it rather than mangle it.
  if (labels.indexOf(value) >= 0) return value;
  if (!missReported) {
    missReported = true;
    console.error('[quizLocalizedAnswer] no index match for an answer value');
  }
  return value;
}

function convert(
  q: QuizPublicQuestion,
  locale: string | undefined,
  value: string,
  direction: Direction
): string {
  if (!locale || !value) return value;
  const loc: LocalizedQuestionStrings | undefined = q.localized?.[locale];
  if (!loc) return value;
  const pick = (
    english: string[] | undefined,
    labels: string[] | undefined
  ): [string[] | undefined, string[] | undefined] =>
    direction === 'toDisplay' ? [english, labels] : [labels, english];

  if (q.type === 'MC') {
    const [from, to] = pick(q.choices, loc.choices);
    return mapValue(value, from, to);
  }
  if (q.type === 'Ordering') {
    const [from, to] = pick(q.orderingItems, loc.orderingItems);
    return value
      .split('|')
      .map((item) => mapValue(item, from, to))
      .join('|');
  }
  if (q.type === 'Matching') {
    const [leftFrom, leftTo] = pick(q.matchingLeft, loc.matchingLeft);
    const [rightFrom, rightTo] = pick(q.matchingRight, loc.matchingRight);
    return value
      .split('|')
      .map((pair) => {
        // indexOf, not split(':') — a definition may itself contain a colon.
        const sep = pair.indexOf(':');
        if (sep < 0) return mapValue(pair, leftFrom, leftTo);
        const term = mapValue(pair.slice(0, sep), leftFrom, leftTo);
        const def = pair.slice(sep + 1);
        return `${term}:${def ? mapValue(def, rightFrom, rightTo) : ''}`;
      })
      .join('|');
  }
  // Free response and FIB are never translated (D21) — identity.
  return value;
}

/** English canonical -> the form displayed in `locale`. Identity when absent. */
export function toDisplayAnswer(
  q: QuizPublicQuestion,
  locale: string | undefined,
  canonical: string
): string {
  return convert(q, locale, canonical, 'toDisplay');
}

/** Displayed form -> the English canonical value that gets written and graded. */
export function toCanonicalAnswer(
  q: QuizPublicQuestion,
  locale: string | undefined,
  display: string
): string {
  return convert(q, locale, display, 'toCanonical');
}
