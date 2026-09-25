import type { QuizQuestion } from '@/types';

// Maps MC/MA questions to one editable option list and back, keeping the stored shape.

export interface ChoiceRow {
  text: string;
  correct: boolean;
}

/** Most options a single-answer question can hold; paper sheets print A-E. */
export const MAX_SINGLE_OPTIONS = 5;
/** Per-list cap choose-all already had for right and wrong options. */
export const MAX_MULTI_PER_LIST = 6;

type ChoiceFields = Pick<
  QuizQuestion,
  'type' | 'correctAnswer' | 'incorrectAnswers' | 'optionOrder'
>;

// `|` separates choose-all options, so it can never appear inside one.
const stripPipes = (s: string) => s.replace(/\|/g, '');

/** Stored order: right options then wrong ones, blanks among the right dropped. */
function storedRows(q: ChoiceFields): ChoiceRow[] {
  const right =
    q.type === 'MA'
      ? (q.correctAnswer ?? '').split('|')
      : [q.correctAnswer ?? ''];
  return [
    ...right
      .filter((s) => s.trim().length > 0)
      .map((text) => ({ text, correct: true })),
    ...(q.incorrectAnswers ?? []).map((text) => ({ text, correct: false })),
  ];
}

const isPermutation = (order: readonly number[], n: number) =>
  order.length === n &&
  new Set(order).size === n &&
  order.every((i) => Number.isInteger(i) && i >= 0 && i < n);

/** Rows in the order the teacher last arranged them. */
export function rowsFromQuestion(q: ChoiceFields): ChoiceRow[] {
  const rows = storedRows(q);
  const order = q.optionOrder;
  return order && isPermutation(order, rows.length)
    ? order.map((i) => rows[i])
    : rows;
}

/** The stored fields for `rows`; `multi` picks choose-all ('MA') over 'MC'. */
export function questionFromRows(
  rows: readonly ChoiceRow[],
  multi: boolean
): Pick<
  QuizQuestion,
  'type' | 'correctAnswer' | 'incorrectAnswers' | 'optionOrder'
> {
  const clean = (r: ChoiceRow) => (multi ? stripPipes(r.text) : r.text);
  const marked = rows.filter((r) => r.correct);
  const unmarked = rows.filter((r) => !r.correct);
  const correctAnswer = multi
    ? marked.map(clean).join('|')
    : marked[0]
      ? clean(marked[0])
      : '';
  const incorrectAnswers = unmarked.map(clean);

  // Only rows that read back (a blank right option does not) take part in the order.
  const kept = rows.filter((r) => !r.correct || clean(r).trim().length > 0);
  const right = kept.filter((r) => r.correct);
  const wrong = kept.filter((r) => !r.correct);
  const order = kept.map((r) =>
    r.correct ? right.indexOf(r) : right.length + wrong.indexOf(r)
  );
  const identity = order.every((v, i) => v === i);
  return {
    type: multi ? 'MA' : 'MC',
    correctAnswer,
    incorrectAnswers,
    optionOrder: identity ? undefined : order,
  };
}

/** Whether another option fits, given the caps for this mode. */
export function canAddRow(rows: readonly ChoiceRow[], multi: boolean): boolean {
  if (!multi) return rows.length < MAX_SINGLE_OPTIONS;
  // A new row starts unmarked, so it counts against the wrong-option list.
  return rows.filter((r) => !r.correct).length < MAX_MULTI_PER_LIST;
}
