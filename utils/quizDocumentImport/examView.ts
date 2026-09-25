/**
 * The ExamView profile (docs/plans/QUIZ_EXAMVIEW_IMPORT.md E4, E8): how a
 * test ExamView printed or exported is recognised, and the section names
 * whose items are written rather than keyed.
 */

import { TEST_BANK_SECTION } from './answerKey';
import type { DocLine } from './types';

/** `____ 1.`, the answer blank ExamView prints before each number. */
const ANSWER_BLANK = /^\s*_{2,}\s*\d{1,3}\s*[.)]/;

const ANSWER_SECTION = /^\s*answer\s+section\s*$/i;

const ANS_FIELD = /\bANS\s*:/;
const PTS_FIELD = /\bPTS\s*:/;

/** ExamView's stock multiple-choice directions. */
const DIRECTIONS =
  /identify\s+the\s+letter\s+of\s+the\s+choice\s+that\s+best\s+completes\s+the\s+statement\s+or\s+answers\s+the\s+question/i;

/** An ExamView type heading, which may carry points or directions after it. */
export const EXAMVIEW_TYPE_HEADING =
  /^\s*(?:multiple\s+choice|multiple\s+response|modified\s+true\s*\/\s*false|true\s*\/\s*false|completion|matching|short\s+answers?|essays?|problems?|other|numeric\s+response)\s*(?:[-–—:(].{0,100})?$/i;

/** Items under these headings are written, so a key's text is a sample answer (E8). */
export const WRITTEN_SECTION =
  /\b(?:short\s+answers?|problems?|essays?|other)\b/i;

/** Two of ExamView's five fingerprints mark the document as ExamView (E4). */
export function isExamView(lines: readonly DocLine[]): boolean {
  let blanks = 0;
  let answerSection = false;
  let ans = false;
  let pts = false;
  let typeHeading = false;
  let directions = false;
  for (const line of lines) {
    const text = line.text;
    if (ANSWER_BLANK.test(text)) blanks += 1;
    if (ANSWER_SECTION.test(text)) answerSection = true;
    if (ANS_FIELD.test(text)) ans = true;
    if (PTS_FIELD.test(text)) pts = true;
    if (TEST_BANK_SECTION.test(text)) typeHeading = true;
    if (DIRECTIONS.test(text)) directions = true;
  }
  const signals = [
    blanks >= 2,
    answerSection,
    ans && pts,
    typeHeading,
    directions,
  ];
  return signals.filter(Boolean).length >= 2;
}
