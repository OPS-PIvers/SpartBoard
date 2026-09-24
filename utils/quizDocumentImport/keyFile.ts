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

import { keyFromLines } from './answerKey';
import { documentKind } from './fileKind';
import { readDocx } from './docxReader';
import { readRtf } from './rtfReader';
import { readPdf, type PdfReaderDeps } from './pdfReader';
import { MAX_DOCUMENT_PAGES, assertWithinByteLimit } from './limits';

export interface ReadKeyFileOptions {
  fileName?: string;
  /** Required to read a PDF key; a Word or rich text file needs none. */
  pdf?: PdfReaderDeps;
}

export { keyFromLines, applyAnswerKey } from './answerKey';

/**
 * Reads a key file into answers by question number. Always read in the
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
      'That answer key can’t be read. Upload a PDF, a Word file (.docx), a rich text file (.rtf) or a Google Doc.'
    );
  }
  assertWithinByteLimit(file);

  if (kind === 'docx') {
    const { lines } = await readDocx(file);
    return keyFromLines(lines);
  }
  if (kind === 'rtf') {
    const { lines } = await readRtf(file);
    return keyFromLines(lines);
  }
  if (kind === 'cartridge') {
    throw new Error(
      'An LMS export already carries its answers, so it can’t also be used as a separate answer key.'
    );
  }
  if (!options.pdf) {
    throw new Error('Reading a PDF answer key needs the PDF reader.');
  }
  const { lines } = await readPdf(file, options.pdf, {
    maxPages: MAX_DOCUMENT_PAGES,
  });
  return keyFromLines(lines);
}
