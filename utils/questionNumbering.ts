/**
 * How a printed test opens a question, in one place so the document reader
 * and the paper stub's OCR agree on what counts as "question 3".
 */

/** `1.` / `12)` / `3 .` — a bare number carries its own punctuation; `____ 1.` is a test bank's answer blank. */
const NUMBERED = /^\s*(?:_{2,}\s*)?(\d{1,3})\s*[.)]\s*(.*)$/;
/**
 * `Question 1:` / `Q3.` / `#4` — the label already says it is a question, so
 * the punctuation after the number is optional. Singular only: "Questions 1-5
 * refer to the passage" is an instruction, not question 1.
 */
const LABELLED =
  /^\s*(?:question|ques|q|#)\s*[.:]?\s*(\d{1,3})\s*[.):]?\s*(.*)$/i;

export interface QuestionOpening {
  number: number;
  /** Whatever followed the number on the same line; '' when nothing did. */
  text: string;
}

/** The question a line opens, or null when the line opens none. */
export function matchQuestionOpening(line: string): QuestionOpening | null {
  const m = NUMBERED.exec(line) ?? LABELLED.exec(line);
  if (!m) return null;
  return { number: Number(m[1]), text: m[2] };
}
