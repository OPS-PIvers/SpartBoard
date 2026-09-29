/**
 * The browser reader: a PDF, Word file, rich text file, LMS export or
 * exported Google Doc in, an `ExtractedQuiz` out (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D1, D2, D11, D18).
 *
 * The AI reader (PR 2) returns the same shape, so the review table and the
 * create step never learn which one ran.
 */

import { parseDocument } from './parseQuestions';
import { readDocx } from './docxReader';
import { readOdt } from './odtReader';
import { readRtf } from './rtfReader';
import { readExamViewTest } from './examViewTestReader';
import { mergeAnswerKey } from './mergeKey';
import {
  browserBmpToPng,
  rtfPictureImages,
  type BmpToPng,
  type RtfPicture,
} from './rtfPictures';
import { readCartridge } from './cartridgeReader';
import { readPdf, type PdfReaderDeps } from './pdfReader';
import type { PdfCropperDeps } from './pdfFigures';
import { attachPdfPictures } from './pdfPictures';
import {
  MAX_DOCUMENT_PAGES,
  assertWithinByteLimitOf,
  assertWithinPageLimit,
  byteLimitFor,
} from './limits';
import type { ExtractedQuiz, RemoteImageFetcher } from './types';
import { UNREADABLE_FILE, documentKind, titleFromFileName } from './fileKind';

export * from './types';
export {
  documentKind,
  isHeicFile,
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
  mergeAnswerKey,
  readAnswerKeyFile,
  type ReadKeyFileOptions,
} from './keyFile';
export { keyItemLabel } from './mergeKey';
export { readKeyItems } from './keyForms';
export {
  fillSavedQuizKey,
  type SavedKeyFill,
  type SavedKeySkip,
} from './savedQuizKey';
export { readDocx } from './docxReader';
export { readOdt } from './odtReader';
export {
  readExamViewTest,
  parseExamViewTest,
  NOT_AN_EXAMVIEW_TEST,
} from './examViewTestReader';
export { readRtf, parseRtf } from './rtfReader';
export {
  readCartridge,
  readCartridgeBanks,
  collectionTitle,
  type CartridgeBank,
  type CartridgeBankCollection,
} from './cartridgeReader';
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
export { importSections, unenforcedChooseNotes } from './importSections';
export {
  driveStimulusUploader,
  STIMULUS_FOLDER,
  type StimulusDrive,
} from './driveStimulusUploader';
export {
  MAX_DOCUMENT_BYTES,
  MAX_EXAMVIEW_TEST_BYTES,
  MAX_DOCUMENT_PAGES,
  byteLimitFor,
  DocumentTooLargeError,
  assertWithinByteLimit,
  assertWithinByteLimitOf,
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
  /** Long text blocks become passage stimuli without a "read the passage" cue. */
  passages?: boolean;
  /** Photos of the test, one per page in order; `file` is the first (R30). */
  pages?: readonly Blob[];
  /** Converts RTF and ExamView bitmap pictures to PNG; defaults to the browser's canvas (E11). */
  bmpToPng?: BmpToPng;
  /** Copies pictures an LMS export links to on another site. */
  fetchRemoteImage?: RemoteImageFetcher;
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
  const reader = {
    multiAnswer: options.multiAnswer === true,
    ...(options.passages ? { passages: true } : {}),
    ...(options.fetchRemoteImage
      ? { fetchRemoteImage: options.fetchRemoteImage }
      : {}),
  };
  const pages =
    kind === 'image' && options.pages?.length ? options.pages : [file];
  assertWithinByteLimitOf(byteLimitFor(kind), pages);

  const warnings: string[] = [];

  // An LMS export brings its own answers and its own pictures (see the reader).
  if (kind === 'cartridge') {
    return readCartridge(file, titleFromFileName(fileName), undefined, reader);
  }

  /** Parses the lines, then converts only the pictures a question uses. */
  const withPictures = async (
    parsed: ReturnType<typeof parseDocument>,
    pictures: readonly RtfPicture[]
  ): Promise<ExtractedQuiz> => {
    const { texts, keySummary } = parsed;
    warnings.push(...parsed.warnings);
    const used = new Set(parsed.questions.flatMap((q) => q.imageIds));
    const { images, unreadable } = await rtfPictureImages(
      pictures.filter((p) => used.has(p.id)),
      options.bmpToPng ?? browserBmpToPng
    );
    // A vector drawing can't be shown, so its question is named for the teacher (E11).
    const questions = parsed.questions.map((q) => {
      if (!q.imageIds.some((id) => unreadable.has(id))) return q;
      warnings.push(
        `Question ${q.sourceLabel ?? q.number}’s picture couldn’t be read — add it in the editor.`
      );
      return { ...q, imageIds: q.imageIds.filter((id) => !unreadable.has(id)) };
    });
    return {
      title: titleFromFileName(fileName),
      questions,
      images,
      ...(texts.length > 0 ? { texts } : {}),
      ...(keySummary ? { keySummary } : {}),
      warnings,
    };
  };

  if (kind === 'rtf') {
    const { lines, pictures } = await readRtf(file);
    return withPictures(parseDocument(lines, reader), pictures);
  }

  // ExamView's own file stores the key, so it merges like a key printed in the test.
  if (kind === 'examview') {
    const test = await readExamViewTest(file);
    warnings.push(...test.warnings);
    const parsed = parseDocument(test.lines, reader);
    const keyed = mergeAnswerKey(
      {
        title: '',
        questions: parsed.questions,
        images: [],
        warnings: [],
        ...(parsed.keySummary ? { keySummary: parsed.keySummary } : {}),
      },
      test.keyItems,
      'document',
      reader
    );
    const questions = keyed.questions.map((q) => {
      const written = test.writtenTexts.get(q.ref?.item ?? q.number);
      return written && q.type === 'free-response'
        ? { ...q, text: written }
        : q;
    });
    return withPictures(
      {
        ...parsed,
        questions,
        warnings: [...parsed.warnings, ...keyed.warnings],
        ...(keyed.keySummary ? { keySummary: keyed.keySummary } : {}),
      },
      test.pictures
    );
  }

  if (kind === 'docx' || kind === 'odt') {
    const { lines, images } =
      kind === 'docx' ? await readDocx(file) : await readOdt(file);
    const {
      questions,
      texts,
      warnings: keyWarnings,
      keySummary,
    } = parseDocument(lines, reader);
    warnings.push(...keyWarnings);
    const used = new Set(questions.flatMap((q) => q.imageIds));
    return {
      title: titleFromFileName(fileName),
      questions,
      ...(texts.length > 0 ? { texts } : {}),
      ...(keySummary ? { keySummary } : {}),
      // A picture nothing points at would upload to Drive unused.
      images: images.filter((img) => used.has(img.id)),
      warnings,
    };
  }

  if (!options.pdf) {
    throw new Error('Reading a PDF needs the PDF reader to be available.');
  }

  if (kind === 'image') {
    // Each photo is a page with no text layer, so every one goes to OCR.
    assertWithinPageLimit(pages.length);
    const { lines } = await readPdf(file, options.pdf, {
      maxPages: MAX_DOCUMENT_PAGES,
    });
    warnings.push(
      'The photos were read by eye, so check the questions and answers below.'
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

  const {
    questions,
    texts,
    warnings: keyWarnings,
    keySummary,
  } = parseDocument(lines, reader);
  warnings.push(...keyWarnings);
  const withTexts = {
    ...(texts.length > 0 ? { texts } : {}),
    ...(keySummary ? { keySummary } : {}),
  };
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
