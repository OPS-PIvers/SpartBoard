/**
 * The browser reader: a PDF, Word file or exported Google Doc in, an
 * `ExtractedQuiz` out (docs/plans/QUIZ_DOCUMENT_IMPORT.md D1, D2, D11, D18).
 *
 * The AI reader (PR 2) returns the same shape, so the review table and the
 * create step never learn which one ran.
 */

import { parseQuestionLines } from './parseQuestions';
import { readDocx } from './docxReader';
import { readPdf, type PdfReaderDeps } from './pdfReader';
import {
  MAX_DOCUMENT_PAGES,
  assertWithinByteLimit,
  assertWithinPageLimit,
} from './limits';
import type { ExtractedQuiz } from './types';

export * from './types';
export { parseQuestionLines, isTrueFalse } from './parseQuestions';
export { findAnswerKey } from './answerKey';
export { readDocx } from './docxReader';
export { readPdf, groupItemsIntoLines } from './pdfReader';
export {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_PAGES,
  DocumentTooLargeError,
  assertWithinByteLimit,
  assertWithinPageLimit,
} from './limits';

export type DocumentKind = 'pdf' | 'docx';

const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** What the file is, by type then by name; null when it is neither. */
export function documentKind(
  file: File | Blob,
  name = ''
): DocumentKind | null {
  const fileName = (name || (file as File).name || '').toLowerCase();
  if (file.type === 'application/pdf' || fileName.endsWith('.pdf'))
    return 'pdf';
  if (file.type === DOCX_TYPE || fileName.endsWith('.docx')) return 'docx';
  return null;
}

/** The document name without its extension, which becomes the quiz title (D11). */
export function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return base || 'Imported Quiz';
}

export interface ReadDocumentOptions {
  /** Shown as the quiz title; defaults to the file's own name. */
  fileName?: string;
  /** Required to read a PDF; a Word file needs none. */
  pdf?: PdfReaderDeps;
}

/**
 * Read one document. Warnings describe what the teacher will need to fix in
 * the review table; nothing here throws on a partial read, because half a
 * quiz they can finish beats an error they can't act on.
 */
export async function readQuizDocument(
  file: Blob,
  options: ReadDocumentOptions = {}
): Promise<ExtractedQuiz> {
  const fileName = options.fileName ?? (file as File).name ?? '';
  const kind = documentKind(file, fileName);
  if (!kind) {
    throw new Error(
      'That file type can’t be read. Upload a PDF, a Word file (.docx) or a Google Doc.'
    );
  }
  assertWithinByteLimit(file);

  const warnings: string[] = [];

  if (kind === 'docx') {
    const { lines, images } = await readDocx(file);
    const questions = parseQuestionLines(lines);
    const used = new Set(questions.flatMap((q) => q.imageIds));
    return {
      title: titleFromFileName(fileName),
      questions,
      // A picture nothing points at would upload to Drive unused.
      images: images.filter((img) => used.has(img.id)),
      warnings,
    };
  }

  if (!options.pdf) {
    throw new Error('Reading a PDF needs the PDF reader to be available.');
  }

  // The page limit is the document's own page count, checked inside the
  // reader the moment the file opens. Counting the pages that produced lines
  // would undercount: a page whose text layer is empty and that OCR could not
  // recover never reaches `lines` at all.
  const { lines, pageCount, scannedPages, usedOcr } = await readPdf(
    file,
    options.pdf,
    { maxPages: MAX_DOCUMENT_PAGES }
  );
  assertWithinPageLimit(pageCount);

  if (usedOcr) {
    warnings.push(
      `Some pages (${scannedPages.join(', ')}) were scanned rather than typed, so the text was read by eye and may need checking.`
    );
  } else if (scannedPages.length > 0) {
    warnings.push(
      `No text could be read from ${scannedPages.length === 1 ? 'page' : 'pages'} ${scannedPages.join(', ')}.`
    );
  }

  // D15: the browser reader takes pictures out of Word files only.
  warnings.push(
    'Pictures in a PDF aren’t brought in — add them to the questions that need them in the editor.'
  );

  return {
    title: titleFromFileName(fileName),
    questions: parseQuestionLines(lines),
    images: [],
    warnings,
  };
}
