/**
 * Picking a reader for a test document (D1), in one place so the import
 * wizard and the paper stub's "Import questions" (D17) read a file the same
 * way — a teacher who imports a PDF one way and fills a stub the other should
 * not get two different readings of the same paper.
 */

import { readQuizDocument } from './index';
import {
  readQuizDocumentWithAi,
  type AiExtractFn,
  type AiExtractVersionsFn,
} from './aiReader';
import { decodeFigurePixels } from './figurePixelsBrowser';
import type { ExtractedQuiz, RemoteImageFetcher } from './types';
import { documentKind } from './fileKind';
import { browserPdfDeps } from './pdfBrowserDeps';
import { browserImageDeps } from './imageBrowserDeps';
import { browserPdfCropper } from './pdfCropBrowser';
import { readPdf } from './pdfReader';
import { MAX_DOCUMENT_PAGES, PageLimitError } from './limits';
import type { DocLine } from './types';

/** Text layer only: a scanned key isn't worth OCR on top of the AI read. */
async function pdfTextLines(file: Blob): Promise<DocLine[]> {
  const { loadPdf } = await browserPdfDeps(file);
  const { lines } = await readPdf(
    file,
    { loadPdf },
    {
      maxPages: MAX_DOCUMENT_PAGES,
    }
  );
  return lines;
}

export const AI_READER_FELL_BACK =
  'The document was read the simple way because the smarter reader wasn’t available. Check the questions and answers below.';

export interface ReadTestDocumentOptions {
  /** Supplied only when the teacher has AI access; absent means browser-only. */
  aiExtract?: AiExtractFn;
  /** The versioned AI call, given only when `quiz-import-versions` is on (QUIZ_IMPORT_VERSIONS V7). */
  aiExtractVersions?: AiExtractVersionsFn;
  /** False when a teacher with AI access switched it off for this read. */
  useAi?: boolean;
  /** Lets the read produce choose-all-that-apply questions. */
  multiAnswer?: boolean;
  /** Long text blocks become passage stimuli without a "read the passage" cue. */
  passages?: boolean;
  /** Photos of the test, one per page in order; `file` is the first (R30). */
  pages?: readonly Blob[];
  /** Copies pictures an LMS export links to on another site. */
  fetchRemoteImage?: RemoteImageFetcher;
}

export async function readTestDocument(
  file: Blob,
  fileName: string,
  options: ReadTestDocumentOptions = {}
): Promise<ExtractedQuiz> {
  // pdf.js and tesseract are only loaded when the file is a PDF, so a Word
  // import never pays for them.
  const kind = documentKind(file, fileName);
  const pages = options.pages?.length ? options.pages : [file];
  const inBrowser = async (): Promise<ExtractedQuiz> =>
    readQuizDocument(file, {
      fileName,
      ...(kind === 'pdf'
        ? { pdf: await browserPdfDeps(file), pdfCropper: browserPdfCropper }
        : {}),
      ...(kind === 'image' ? { pdf: browserImageDeps(pages), pages } : {}),
      ...(options.multiAnswer ? { multiAnswer: true } : {}),
      ...(options.passages ? { passages: true } : {}),
      ...(options.fetchRemoteImage
        ? { fetchRemoteImage: options.fetchRemoteImage }
        : {}),
    });

  // The callable takes only a PDF or a Word file, so everything else is read here.
  if (!options.aiExtract) return inBrowser();
  // Only a teacher who could have had AI is told which reader ran.
  if (
    options.useAi === false ||
    kind === 'rtf' ||
    kind === 'odt' ||
    kind === 'examview' ||
    kind === 'cartridge' ||
    kind === 'image'
  ) {
    try {
      const extracted = await inBrowser();
      // A PDF or Word file the plain reader found nothing in needs AI, so it is used without asking.
      const plainFoundNothing =
        options.useAi === false &&
        (kind === 'pdf' || kind === 'docx') &&
        !extracted.questions.some((q) => q.text.trim());
      if (!plainFoundNothing) return { ...extracted, readBy: 'plain' };
    } catch (err) {
      // A long versioned PDF needs the AI reader, so it is used without asking.
      const aiCanOpen =
        kind === 'pdf' &&
        options.aiExtractVersions &&
        err instanceof PageLimitError;
      if (!aiCanOpen) throw err;
    }
  }

  try {
    const extracted = await readQuizDocumentWithAi(file, {
      fileName,
      extract: options.aiExtract,
      cropper: browserPdfCropper,
      readPdfLines: pdfTextLines,
      ...(options.multiAnswer ? { multiAnswer: true } : {}),
      ...(options.aiExtractVersions
        ? {
            extractVersions: options.aiExtractVersions,
            decodePixels: decodeFigurePixels,
          }
        : {}),
    });
    return { ...extracted, readBy: 'ai' };
  } catch (err) {
    // Half a quiz to fix beats an error screen mid-import.
    console.warn('[quizImport] AI reader unavailable', err);
    let extracted: ExtractedQuiz;
    try {
      extracted = await inBrowser();
    } catch (browserErr) {
      // A versioned file can be past the plain reader's page limit, so its AI error is the real one.
      if (options.aiExtractVersions) throw err;
      throw browserErr;
    }
    return {
      ...extracted,
      readBy: 'plain',
      warnings: [AI_READER_FELL_BACK, ...extracted.warnings],
    };
  }
}
