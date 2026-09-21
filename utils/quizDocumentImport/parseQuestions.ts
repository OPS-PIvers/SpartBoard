/**
 * Turns a document's lines into questions
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D2, D12).
 *
 * Extract, never invent: a stem is what the document printed, options are
 * kept as written with no minimum count, and a question the reader cannot
 * type becomes free-response carrying a warning rather than a guess. Sibling
 * of `utils/paperQuestionOcr.ts`, which answers a narrower question (stems
 * only, by number) for the paper stub and stays as it is until PR 4.
 */

import type { QuizQuestionType } from '@/types';
import { findAnswerKey } from './answerKey';
import type { DocLine, ExtractedOption, ExtractedQuestion } from './types';

/** `1.` / `12)` / `3 .` opening a question. */
const NUMBERED = /^\s*(\d{1,3})\s*[.)]\s*(.*)$/;
/** `A.` / `b)` / `(C)` opening an option, optionally starred as the answer. */
const OPTION = /^\s*(\*\s*)?\(?([A-Fa-f])[.)]\s*(.*)$/;
/** A bare `(C)` form, where the letter is wrapped rather than punctuated. */
const OPTION_PAREN = /^\s*(\*\s*)?\(([A-Fa-f])\)\s*(.*)$/;

const TRUE_FALSE = /^(true|false|t|f)$/i;

const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

interface OptionDraft extends ExtractedOption {
  /** The document marked this one as the answer. */
  marked: boolean;
}

function matchOption(
  line: DocLine
): { letter: string; text: string; marked: boolean } | null {
  const m = OPTION_PAREN.exec(line.text) ?? OPTION.exec(line.text);
  if (!m) return null;
  return {
    letter: m[2].toUpperCase(),
    text: tidy(m[3]),
    marked: Boolean(m[1]) || line.emphasized === true,
  };
}

/**
 * Options must read A, B, C… in order. A line like "A. 1849" inside a stem is
 * not an option if the question already ran past that letter, and a document
 * that jumps letters is telling us this isn't an option list at all.
 */
const followsInSequence = (options: OptionDraft[], letter: string): boolean => {
  const expected = String.fromCharCode('A'.charCodeAt(0) + options.length);
  return letter === expected;
};

function typeFor(options: OptionDraft[]): QuizQuestionType {
  if (options.length === 0) return 'free-response';
  return 'MC';
}

interface Draft {
  number: number;
  textParts: string[];
  options: OptionDraft[];
  imageIds: string[];
}

function finish(
  draft: Draft,
  keyLetter: string | undefined
): ExtractedQuestion {
  const warnings: string[] = [];
  const text = tidy(draft.textParts.join(' '));
  const type = typeFor(draft.options);
  const options: ExtractedOption[] = draft.options.map((o) => ({
    letter: o.letter,
    text: o.text,
  }));

  if (type === 'free-response') {
    warnings.push(
      'No answer choices were found, so this came in as a written-response question.'
    );
    // The document answered it, so it had choices the reader missed — that is
    // a layout the teacher can fix, not a written-response question.
    if (keyLetter) {
      warnings.push(
        `The answer key says ${keyLetter} for this question, so its answer choices were probably missed.`
      );
    }
  }

  let correctAnswer = '';
  if (type === 'MC') {
    const marked = draft.options.filter((o) => o.marked);
    if (keyLetter) {
      const hit = draft.options.find((o) => o.letter === keyLetter);
      if (hit) {
        correctAnswer = hit.text;
      } else {
        warnings.push(
          `The answer key says ${keyLetter}, but this question has no option ${keyLetter}.`
        );
      }
    } else if (marked.length === 1) {
      correctAnswer = marked[0].text;
    } else if (marked.length > 1) {
      warnings.push(
        'More than one answer choice is marked, so the answer was left blank.'
      );
    }
    if (draft.options.length === 1) {
      warnings.push('Only one answer choice was found.');
    }
  }

  if (!text) warnings.push('No question text was found.');

  return {
    number: draft.number,
    text,
    type,
    options,
    correctAnswer,
    imageIds: draft.imageIds,
    warnings,
  };
}

/**
 * Walk the lines once. A numbered line opens a question, option lines attach
 * to it in letter order, and anything else extends whichever part is open.
 * Numbers must ascend, so a "2." inside a sentence cannot restart the count.
 */
export function parseQuestionLines(
  lines: readonly DocLine[]
): ExtractedQuestion[] {
  const { letterByNumber, keyLineIndexes } = findAnswerKey(lines);

  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let lastOption: OptionDraft | null = null;

  lines.forEach((line, index) => {
    if (keyLineIndexes.has(index)) return;
    const text = line.text.trim();
    if (!text) {
      // A paragraph holding nothing but a picture still belongs to the
      // question it sits under.
      if (current && line.imageIds?.length) {
        current.imageIds.push(...line.imageIds);
      }
      return;
    }

    const numbered = NUMBERED.exec(text);
    const lastNumber = current?.number ?? 0;
    if (numbered && Number(numbered[1]) > lastNumber) {
      current = {
        number: Number(numbered[1]),
        textParts: [numbered[2]],
        options: [],
        imageIds: [...(line.imageIds ?? [])],
      };
      lastOption = null;
      drafts.push(current);
      return;
    }

    if (!current) return;

    const option = matchOption(line);
    if (option && followsInSequence(current.options, option.letter)) {
      lastOption = {
        letter: option.letter,
        text: option.text,
        marked: option.marked,
      };
      current.options.push(lastOption);
      current.imageIds.push(...(line.imageIds ?? []));
      return;
    }

    // A wrapped line: continues the option it follows, or the stem if the
    // question hasn't reached its options yet.
    if (lastOption) {
      lastOption.text = tidy(`${lastOption.text} ${text}`);
    } else {
      current.textParts.push(text);
    }
    current.imageIds.push(...(line.imageIds ?? []));
  });

  return drafts.map((d) => finish(d, letterByNumber.get(d.number)));
}

/** True/False written as two options — kept as MC, which is how Quiz stores it. */
export const isTrueFalse = (q: ExtractedQuestion): boolean =>
  q.options.length === 2 && q.options.every((o) => TRUE_FALSE.test(o.text));
