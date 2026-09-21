/**
 * The optional answer key file picked beside the test
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D8).
 *
 * Letters only mean something while the options still carry the letters the
 * document printed, so the key is applied to the `ExtractedQuiz` and not to
 * the finished quiz, where A–F has already become answer-plus-distractors.
 *
 * Nothing here throws. A key that does not line up with the test — an answer
 * for a question that isn't there, a letter with no such choice — is a row
 * note for the review table, because the teacher can see both documents and
 * the reader cannot.
 */

import { entriesOnLine } from './answerKey';
import { documentKind } from './fileKind';
import { readDocx } from './docxReader';
import { readPdf, type PdfReaderDeps } from './pdfReader';
import { MAX_DOCUMENT_PAGES, assertWithinByteLimit } from './limits';
import type { DocLine, ExtractedQuestion, ExtractedQuiz } from './types';

/** Letter by question number. The whole file is key, so every entry counts. */
export function keyFromLines(lines: readonly DocLine[]): Map<number, string> {
  const byNumber = new Map<number, string>();
  for (const line of lines) {
    for (const [number, letter] of entriesOnLine(line.text)) {
      // First wins: a key printed twice is likelier a header repeat than a
      // correction, and silently taking the later one would be invisible.
      if (!byNumber.has(number)) byNumber.set(number, letter);
    }
  }
  return byNumber;
}

const ordinal = (numbers: number[]): string =>
  numbers.length === 1
    ? `question ${numbers[0]}`
    : `questions ${numbers.join(', ')}`;

function applyToQuestion(
  question: ExtractedQuestion,
  letter: string
): ExtractedQuestion {
  if (question.type !== 'MC') {
    return {
      ...question,
      warnings: [
        ...question.warnings,
        `The key gives ${letter} for this question, but it isn’t multiple choice, so it was left as read.`,
      ],
    };
  }

  const option = question.options.find((o) => o.letter === letter);
  if (!option) {
    return {
      ...question,
      warnings: [
        ...question.warnings,
        `The key gives ${letter} for this question, but it has no choice ${letter}.`,
      ],
    };
  }

  const previous = question.correctAnswer.trim();
  const disagrees = previous && previous !== option.text;
  return {
    ...question,
    correctAnswer: option.text,
    warnings: disagrees
      ? [
          ...question.warnings,
          `The test document answered this differently (${previous}); the key file’s answer was used.`,
        ]
      : question.warnings,
  };
}

/**
 * Matches the key onto the test by question number. The key file wins over an
 * answer found inside the test, because a teacher who attached one meant it.
 */
export function applyAnswerKey(
  quiz: ExtractedQuiz,
  key: ReadonlyMap<number, string>
): ExtractedQuiz {
  if (key.size === 0) return quiz;

  const questions = quiz.questions.map((question) => {
    const letter = key.get(question.number);
    return letter ? applyToQuestion(question, letter) : question;
  });

  const numbers = new Set(quiz.questions.map((q) => q.number));
  const unmatched = [...key.keys()]
    .filter((n) => !numbers.has(n))
    .sort((a, b) => a - b);
  const warnings = [...quiz.warnings];
  if (unmatched.length > 0) {
    warnings.push(
      `The answer key has an answer for ${ordinal(unmatched)}, which ${unmatched.length === 1 ? 'isn’t' : 'aren’t'} in this test.`
    );
  }

  return { ...quiz, questions, warnings };
}

export interface ReadKeyFileOptions {
  fileName?: string;
  /** Required to read a PDF key; a Word file needs none. */
  pdf?: PdfReaderDeps;
}

/**
 * Reads a key file into letters by question number. Always read in the
 * browser: a page of numbers and letters is what the plain reader is good at,
 * and it costs the teacher no AI allowance.
 */
export async function readAnswerKeyFile(
  file: Blob,
  options: ReadKeyFileOptions = {}
): Promise<Map<number, string>> {
  const fileName = options.fileName ?? (file as File).name ?? '';
  const kind = documentKind(file, fileName);
  if (!kind) {
    throw new Error(
      'That answer key can’t be read. Upload a PDF, a Word file (.docx) or a Google Doc.'
    );
  }
  assertWithinByteLimit(file);

  if (kind === 'docx') {
    const { lines } = await readDocx(file);
    return keyFromLines(lines);
  }
  if (!options.pdf) {
    throw new Error('Reading a PDF answer key needs the PDF reader.');
  }
  const { lines } = await readPdf(file, options.pdf, {
    maxPages: MAX_DOCUMENT_PAGES,
  });
  return keyFromLines(lines);
}
