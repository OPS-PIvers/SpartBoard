/**
 * Filling answers from a key into a quiz that is already saved
 * (docs/plans/QUIZ_IMPORT_RELIABILITY.md R17, R26).
 *
 * Only questions still marked `needsKey` are filled. On those, every option
 * sits in `incorrectAnswers` in printed order (see `toQuizData`), so letter n
 * is `incorrectAnswers[n]`. A question that already has an answer is never
 * overwritten; it is listed as skipped, as is a letter the question has no
 * choice for, so the review can say exactly what didn't go in.
 */

import type { QuizQuestion } from '@/types';
import { multiAnswerKey, type KeyItem } from './types';
import { keyItemLabel } from './mergeKey';
import { questionNeedsKey } from '@/utils/quizNeedsKey';

export interface SavedKeySkip {
  /** The question the entry matched, when it matched one. */
  questionId?: string;
  /** The key entry as printed, e.g. `2·3` or `5A`. */
  label: string;
  reason: string;
}

export interface SavedKeyFill {
  questions: QuizQuestion[];
  /** Ids of the questions that got an answer. */
  filled: string[];
  skipped: SavedKeySkip[];
}

const LETTERS = /^[A-F](?:, [A-F])*$/;
const TRUE = /^(?:t|true)$/i;
const FALSE = /^(?:f|false)$/i;

/** The question a key entry is for: by printed label where the quiz has one, else by order. */
function questionFor(
  questions: readonly QuizQuestion[],
  item: KeyItem,
  items: readonly KeyItem[]
): number {
  const plain = `${item.item}${item.part ?? ''}`;
  const full = keyItemLabel(item);
  const labelled = questions.findIndex(
    (q) => q.sourceLabel === full || q.sourceLabel === plain
  );
  if (labelled !== -1) return labelled;
  if (item.part) return -1;
  // A sectioned entry falls back to position only when its number is unique in the key.
  if (
    item.section &&
    items.filter((other) => other.item === item.item).length > 1
  ) {
    return -1;
  }
  const at = item.item - 1;
  return at >= 0 && at < questions.length && !questions[at].sourceLabel
    ? at
    : -1;
}

/** The chosen option indexes, or why the answer can't be placed. */
function chosen(
  q: QuizQuestion,
  answer: string
): { indexes: number[] } | { reason: string } {
  const options = q.incorrectAnswers;
  if (LETTERS.test(answer)) {
    const indexes = answer
      .split(', ')
      .map((letter) => letter.charCodeAt(0) - 65);
    const past = answer
      .split(', ')
      .find((_letter, i) => indexes[i] >= options.length);
    if (past) {
      return {
        reason: `key says ${past}, question has ${options.length} choices`,
      };
    }
    return { indexes };
  }
  const wanted = TRUE.test(answer)
    ? (text: string) => TRUE.test(text.trim())
    : FALSE.test(answer)
      ? (text: string) => FALSE.test(text.trim())
      : (text: string) =>
          text.trim().toLowerCase() === answer.trim().toLowerCase();
  const at = options.findIndex(wanted);
  return at === -1
    ? { reason: `key says “${answer}”, which isn’t one of the choices` }
    : { indexes: [at] };
}

function fill(
  q: QuizQuestion,
  answer: string
): { question: QuizQuestion } | { reason: string } {
  if (q.type === 'FIB' && q.incorrectAnswers.length === 0) {
    if (LETTERS.test(answer)) {
      return { reason: `key says ${answer}, question has no choices` };
    }
    const { needsKey: _needsKey, ...rest } = q;
    return { question: { ...rest, correctAnswer: answer } };
  }
  if (q.type !== 'MC' && q.type !== 'MA') {
    return { reason: 'not a multiple choice question — skipped' };
  }
  const picked = chosen(q, answer);
  if ('reason' in picked) return picked;
  const { indexes } = picked;
  if (q.type === 'MC' && indexes.length > 1) {
    return { reason: `key says ${answer}, question takes one answer` };
  }
  const right = indexes.map((i) => q.incorrectAnswers[i]);
  const { needsKey: _needsKey, ...rest } = q;
  return {
    question: {
      ...rest,
      correctAnswer: q.type === 'MA' ? multiAnswerKey(right) : right[0],
      incorrectAnswers: q.incorrectAnswers.filter(
        (_text, i) => !indexes.includes(i)
      ),
    },
  };
}

/** Fills `needsKey` questions from a key; everything else is reported, never changed. */
export function fillSavedQuizKey(
  questions: readonly QuizQuestion[],
  items: readonly KeyItem[]
): SavedKeyFill {
  const next = [...questions];
  const filled: string[] = [];
  const skipped: SavedKeySkip[] = [];
  for (const item of items) {
    const label = keyItemLabel(item);
    if (!item.answer) continue;
    const at = questionFor(next, item, items);
    if (at === -1) {
      skipped.push({ label, reason: 'no question with this number' });
      continue;
    }
    const q = next[at];
    if (!questionNeedsKey(q)) {
      skipped.push({
        questionId: q.id,
        label,
        reason: q.correctAnswer.trim()
          ? 'already answered — skipped'
          : 'not a multiple choice question — skipped',
      });
      continue;
    }
    const result = fill(q, item.answer);
    if ('reason' in result) {
      skipped.push({ questionId: q.id, label, reason: result.reason });
      continue;
    }
    next[at] = result.question;
    filled.push(q.id);
  }
  return { questions: next, filled, skipped };
}
