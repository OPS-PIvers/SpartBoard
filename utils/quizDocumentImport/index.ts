/**
 * The browser reader: a PDF, Word file, rich text file, LMS export or
 * exported Google Doc in, an `ExtractedQuiz` out (docs/plans/QUIZ_DOCUMENT_IMPORT.md D1, D2, D11, D18).
 *
 * The AI reader (PR 2) returns the same shape, so the review table and the
 * create step never learn which one ran.
 */

import { parseDocument } from './parseQuestions';
import { readDocx } from './docxReader';
import { readRtf } from './rtfReader';
import { readCartridge } from './cartridgeReader';
import { readPdf, type PdfReaderDeps } from './pdfReader';
import type { PdfCropperDeps } from './pdfFigures';
import { attachPdfPictures } from './pdfPictures';
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
export {
  parseDocument,
  parseQuestionLines,
  isTrueFalse,
  splitAtColumnMarkers,
} from './parseQuestions';
export { findAnswerKey } from './answerKey';
export {
  keyFromLines,
  applyAnswerKey,
  readAnswerKeyFile,
  type ReadKeyFileOptions,
} from './keyFile';
export { readDocx } from './docxReader';
export { readRtf, parseRtf } from './rtfReader';
export { readCartridge } from './cartridgeReader';
export { readPdf, groupItemsIntoLines } from './pdfReader';
export {
  columnBands,
  bandOf,
  layoutPage,
  ocrItems,
  stripRunningLines,
  type OcrPage,
} from './pdfLayout';
export {
  extractedToQuizData,
  rowWarnings,
  reviewExtrasFor,
  type ReviewExtras,
} from './toQuizData';
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
  /** Crops a PDF's pictures out of the page; omitted leaves them behind (D15). */
  pdfCropper?: (file: Blob) => Promise<PdfCropperDeps>;
  /** Lets the read produce choose-all-that-apply questions. */
  multiAnswer?: boolean;
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
  const reader = { multiAnswer: options.multiAnswer === true };
  assertWithinByteLimit(file);

  const warnings: string[] = [];

  // An LMS export brings its own answers and its own pictures (see the reader).
  if (kind === 'cartridge') {
    return readCartridge(file, titleFromFileName(fileName), undefined, reader);
  }

  if (kind === 'rtf') {
    const { lines } = await readRtf(file);
    // Rich text carries its pictures as hex blobs the reader skips (D15).
    warnings.push(
      'Pictures in a rich text file aren’t brought in — add them to the questions that need them in the editor.'
    );
    const { questions, texts } = parseDocument(lines, reader);
    return {
      title: titleFromFileName(fileName),
      questions,
      images: [],
      ...(texts.length > 0 ? { texts } : {}),
      warnings,
    };
  }

  if (kind === 'docx') {
    const { lines, images } = await readDocx(file);
    const { questions, texts } = parseDocument(lines, reader);
    const used = new Set(questions.flatMap((q) => q.imageIds));
    return {
      title: titleFromFileName(fileName),
      questions,
      ...(texts.length > 0 ? { texts } : {}),
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
  const { lines, pageCount, scannedPages, usedOcr, pictures } = await readPdf(
    file,
    options.pdf,
    { maxPages: MAX_DOCUMENT_PAGES, pictures: Boolean(options.pdfCropper) }
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

  const { questions, texts } = parseDocument(lines, reader);
  const withTexts = texts.length > 0 ? { texts } : {};
  if (!options.pdfCropper) {
    // D15: without a cropper the browser reader leaves a PDF's pictures behind.
    warnings.push(
      'Pictures in a PDF aren’t brought in — add them to the questions that need them in the editor.'
    );
    return {
      title: titleFromFileName(fileName),
      questions,
      images: [],
      ...withTexts,
      warnings,
    };
  }

  const attached = await attachPdfPictures(
    file,
    questions,
    pictures,
    options.pdfCropper
  );
  return {
    title: titleFromFileName(fileName),
    questions: attached.questions,
    images: attached.images,
    ...withTexts,
    warnings: [...warnings, ...attached.warnings],
  };
}
