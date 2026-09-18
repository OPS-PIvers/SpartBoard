/**
 * Turns OCR text from a printed test paper into question text for a paper
 * stub (plan §8.3, Increment 3). Pure. A misread here can only mislabel a
 * question: the key comes from the bubbled key sheet and scores from bubbles.
 */

import type { QuizData } from '@/types';

/** `1.` / `12)` / `3 .` at the start of a line. */
const NUMBERED = /^\s*(\d{1,3})\s*[.)]\s*(.*)$/;
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
    const numbered = NUMBERED.exec(line);
    if (numbered) {
      const n = Number(numbered[1]);
      const last = current ?? 0;
      if (n > last && n <= expectedCount) {
        current = n;
        inOptions = false;
        byNumber[n] = tidy(numbered[2]);
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
