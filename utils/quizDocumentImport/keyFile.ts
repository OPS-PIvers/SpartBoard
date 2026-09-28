/**
 * The optional answer key file picked beside the test
 * (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D8).
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

import { readKeyItems } from './keyForms';
import { documentKind } from './fileKind';
import { readDocx } from './docxReader';
import { readOdt } from './odtReader';
import { readRtf } from './rtfReader';
import { readPdf, type PdfReaderDeps } from './pdfReader';
import { MAX_DOCUMENT_PAGES, assertWithinByteLimit } from './limits';

export interface ReadKeyFileOptions {
  fileName?: string;
  /** Required to read a PDF key; a Word or rich text file needs none. */
  pdf?: PdfReaderDeps;
  /** Reads `3. A, C` as one question keyed with several letters. */
  multiAnswer?: boolean;
}

import type { KeyItem } from './types';

export { keyFromLines } from './answerKey';
export { applyAnswerKey, mergeAnswerKey } from './mergeKey';

/**
 * Reads a key file into its entries, for `mergeAnswerKey`. Always read in the
 * browser: a key is what the plain reader is good at, and it costs the
 * teacher no AI allowance.
 */
export async function readAnswerKeyFile(
  file: Blob,
  options: ReadKeyFileOptions = {}
): Promise<KeyItem[]> {
  const fileName = options.fileName ?? (file as File).name ?? '';
  const kind = documentKind(file, fileName);
  const reader = { multiAnswer: options.multiAnswer === true };
  if (!kind) {
    throw new Error(
      'That answer key can’t be read. Upload a PDF, a Word or OpenDocument file, a rich text file (.rtf) or a Google Doc.'
    );
  }
  assertWithinByteLimit(file);

  if (kind === 'docx' || kind === 'odt') {
    const { lines } =
      kind === 'docx' ? await readDocx(file) : await readOdt(file);
    return readKeyItems(lines, reader);
  }
  if (kind === 'rtf') {
    const { lines } = await readRtf(file);
    return readKeyItems(lines, reader);
  }
  if (kind === 'cartridge' || kind === 'examview') {
    throw new Error(
      kind === 'cartridge'
        ? 'An LMS export already carries its answers, so it can’t also be used as a separate answer key.'
        : 'An ExamView test already carries its answers, so it can’t also be used as a separate answer key.'
    );
  }
  if (!options.pdf) {
    throw new Error('Reading a PDF answer key needs the PDF reader.');
  }
  const { lines } = await readPdf(file, options.pdf, {
    maxPages: MAX_DOCUMENT_PAGES,
  });
  return readKeyItems(lines, reader);
}
