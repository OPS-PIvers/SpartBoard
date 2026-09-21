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
import type { ExtractedQuiz } from './types';

export * from './types';
export { parseQuestionLines, isTrueFalse } from './parseQuestions';
export { findAnswerKey } from './answerKey';
export { readDocx } from './docxReader';
export { readPdf, groupItemsIntoLines } from './pdfReader';

/** D18: the reader is a classroom tool, not a batch job. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 20;

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

/** Thrown before anything is read, so an oversized file costs nothing. */
export class DocumentTooLargeError extends Error {}

export function assertWithinLimits(file: Blob): void {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new DocumentTooLargeError(
      `This file is larger than ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB. Split it into smaller files and import them one at a time.`
    );
  }
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
  assertWithinLimits(file);

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

  const { lines, scannedPages, usedOcr } = await readPdf(file, options.pdf);

  const pages = new Set(lines.map((l) => l.page));
  const pageCount = Math.max(pages.size, scannedPages.length);
  if (pageCount > MAX_DOCUMENT_PAGES) {
    throw new DocumentTooLargeError(
      `This file is ${pageCount} pages. Split it into files of ${MAX_DOCUMENT_PAGES} pages or fewer and import them one at a time.`
    );
  }

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
