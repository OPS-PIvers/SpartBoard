/**
 * Turns OCR text from a printed test paper into question text for a paper
 * stub (plan §8.3, Increment 3). Pure. A misread here can only mislabel a
 * question: the key comes from the bubbled key sheet and scores from bubbles.
 */

import type { QuizData, QuizQuestion } from '@/types';
import { matchQuestionOpening } from '@/utils/questionNumbering';
import {
  fillSavedQuizKey,
  type SavedKeyFill,
} from './quizDocumentImport/savedQuizKey';
import type { KeyItem } from './quizDocumentImport/types';
import { CHOICE_LETTERS } from './paperSheetLayout';
import { isPlaceholderLetterChoices } from './paperSheetPlan';

/** `A.` / `b)` / `(C)` option lines, which end the question text. */
const OPTION = /^\s*\(?[A-Ea-e][.)]\s|^\s*\([A-Ea-e]\)\s*/;
/** The placeholder text `buildPaperStubQuiz` writes. */
const PLACEHOLDER = /^Question \d+$/;

export interface OcrQuestionParse {
  /** Question text by 1-based number; a number OCR never found is absent. */
  byNumber: Record<number, string>;
  /** Numbers in 1..expected the text never produced. */
  missing: number[];
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Walk the text line by line. A numbered line opens a question; further
 * lines extend it until the next number or an option line. Numbers must
 * ascend so a stray "2." inside a sentence cannot restart the count.
 */
export function parseNumberedQuestions(
  text: string,
  expectedCount: number
): OcrQuestionParse {
  const byNumber: Record<number, string> = {};
  let current: number | null = null;
  let inOptions = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const opening = matchQuestionOpening(line);
    if (opening) {
      const n = opening.number;
      const last = current ?? 0;
      if (n > last && n <= expectedCount) {
        current = n;
        inOptions = false;
        byNumber[n] = tidy(opening.text);
        continue;
      }
    }
    if (current === null) continue;
    if (OPTION.test(line)) {
      inOptions = true;
      continue;
    }
    if (inOptions) continue;
    byNumber[current] = tidy(`${byNumber[current]} ${line}`);
  }
  const missing: number[] = [];
  for (let n = 1; n <= expectedCount; n += 1) {
    if (!byNumber[n]) missing.push(n);
  }
  return { byNumber, missing };
}

export const isPlaceholderQuestion = (text: string): boolean =>
  PLACEHOLDER.test(text.trim());

/** Replace the text of the given questions (by 1-based row) and bump `updatedAt`. */
export function applyQuestionText(
  quiz: QuizData,
  textByRow: Readonly<Record<number, string>>,
  now: number
): QuizData {
  let changed = false;
  const questions = quiz.questions.map((q, i) => {
    const next = textByRow[i + 1];
    if (next === undefined || !next.trim() || next === q.text) return q;
    changed = true;
    return { ...q, text: next.trim() };
  });
  return changed ? { ...quiz, questions, updatedAt: now } : quiz;
}

/** What a read document offers for one stub row (D17). */
export interface QuestionFill {
  text: string;
  /** Every choice the document listed, answer included. Absent for a written response. */
  options?: string[];
  /** The choice the document's key names; '' when it named none. */
  correctAnswer?: string;
}

/**
 * Fill stem, choices and key onto the stub rows the teacher ticked (D17).
 *
 * The option count follows the document, so a 3-choice question stops being
 * a 4-choice stub. A row the document had no choices for keeps the type it
 * already had: a stub that was built as multiple choice is more likely to
 * have had its choices misread than to have been written-response all along.
 */
export function applyQuestionFill(
  quiz: QuizData,
  fillByRow: Readonly<Record<number, QuestionFill>>,
  now: number
): QuizData {
  let changed = false;
  const questions = quiz.questions.map((q, i) => {
    const fill = fillByRow[i + 1];
    if (!fill || !fill.text.trim()) return q;

    const next = { ...q, text: fill.text.trim() };
    const options = fill.options?.filter((o) => o.trim());
    if (options && options.length > 0) {
      const answer = fill.correctAnswer?.trim() ?? '';
      next.type = 'MC';
      next.correctAnswer = answer;
      next.incorrectAnswers = options.filter((o) => o !== answer);
      // An answer the document supplied is a key the teacher no longer owes.
      if (answer) delete next.needsKey;
      else next.needsKey = true;
    }

    if (
      next.text === q.text &&
      next.type === q.type &&
      next.correctAnswer === q.correctAnswer &&
      next.incorrectAnswers.join('\u0000') ===
        q.incorrectAnswers.join('\u0000') &&
      next.needsKey === q.needsKey
    ) {
      return q;
    }
    changed = true;
    return next;
  });
  return changed ? { ...quiz, questions, updatedAt: now } : quiz;
}

/**
 * A key file's answers onto stub rows (R17). A row still holding the bare
 * bubble letters has only a placeholder key, so it takes the key's letter;
 * rows the test already filled go through the saved-quiz rules (R26).
 */
export function fillStubKey(
  questions: readonly QuizQuestion[],
  items: readonly KeyItem[]
): SavedKeyFill {
  const open = questions.map((q) => {
    const choices = [q.correctAnswer, ...q.incorrectAnswers];
    if (q.type !== 'MC' || !isPlaceholderLetterChoices(choices)) return q;
    return {
      ...q,
      correctAnswer: '',
      incorrectAnswers: CHOICE_LETTERS.slice(0, choices.length),
      needsKey: true,
    };
  });
  const result = fillSavedQuizKey(open, items);
  const filled = new Set(result.filled);
  return {
    ...result,
    questions: result.questions.map((q, i) =>
      filled.has(q.id) ? q : questions[i]
    ),
  };
}
