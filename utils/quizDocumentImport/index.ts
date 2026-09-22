/**
 * The browser reader: a PDF, Word file, rich text file or exported Google
 * Doc in, an `ExtractedQuiz` out (docs/plans/QUIZ_DOCUMENT_IMPORT.md D1, D2, D11, D18).
 *
 * The AI reader (PR 2) returns the same shape, so the review table and the
 * create step never learn which one ran.
 */

import { parseQuestionLines } from './parseQuestions';
import { readDocx } from './docxReader';
import { readRtf } from './rtfReader';
import { readPdf, type PdfReaderDeps } from './pdfReader';
import {
  MAX_DOCUMENT_PAGES,
  assertWithinByteLimit,
  assertWithinPageLimit,
} from './limits';
import type { ExtractedQuiz } from './types';
import { UNREADABLE_FILE, documentKind, titleFromFileName } from './fileKind';

export * from './types';
export {
  documentKind,
  titleFromFileName,
  UNREADABLE_FILE,
  type DocumentKind,
} from './fileKind';
export { parseQuestionLines, isTrueFalse } from './parseQuestions';
export { findAnswerKey } from './answerKey';
export {
  keyFromLines,
  applyAnswerKey,
  readAnswerKeyFile,
  type ReadKeyFileOptions,
} from './keyFile';
export { readDocx } from './docxReader';
export { readRtf, parseRtf } from './rtfReader';
export { readPdf, groupItemsIntoLines } from './pdfReader';
export { extractedToQuizData, rowWarnings } from './toQuizData';
export {
  cropPdfFigures,
  pixelRect,
  figureKey,
  FIGURE_PADDING,
  type FigureBox,
  type PdfCropperDeps,
  type PixelRect,
} from './pdfFigures';
export {
  readQuizDocumentWithAi,
  aiQuizToExtracted,
  graftDocxImages,
  blobToBase64,
  type AiExtractFn,
  type AiExtractedQuiz,
} from './aiReader';
export { attachDocumentImages, type StimulusUploader } from './attachImages';
export {
  driveStimulusUploader,
  STIMULUS_FOLDER,
  type StimulusDrive,
} from './driveStimulusUploader';
export {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_PAGES,
  DocumentTooLargeError,
  assertWithinByteLimit,
  assertWithinPageLimit,
} from './limits';

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
    throw new Error(UNREADABLE_FILE);
  }
  assertWithinByteLimit(file);

  const warnings: string[] = [];

  if (kind === 'rtf') {
    const { lines } = await readRtf(file);
    // Rich text carries its pictures as hex blobs the reader skips (D15).
    warnings.push(
      'Pictures in a rich text file aren’t brought in — add them to the questions that need them in the editor.'
    );
    return {
      title: titleFromFileName(fileName),
      questions: parseQuestionLines(lines),
      images: [],
      warnings,
    };
  }

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
