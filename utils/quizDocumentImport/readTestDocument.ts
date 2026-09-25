/**
 * Picking a reader for a test document (D1), in one place so the import
 * wizard and the paper stub's "Import questions" (D17) read a file the same
 * way — a teacher who imports a PDF one way and fills a stub the other should
 * not get two different readings of the same paper.
 */

import { readQuizDocument } from './index';
import { readQuizDocumentWithAi, type AiExtractFn } from './aiReader';
import type { ExtractedQuiz } from './types';
import { documentKind } from './fileKind';
import { browserPdfDeps } from './pdfBrowserDeps';
import { browserImageDeps } from './imageBrowserDeps';
import { browserPdfCropper } from './pdfCropBrowser';
import { readPdf } from './pdfReader';
import { MAX_DOCUMENT_PAGES } from './limits';
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
  /** False when a teacher with AI access switched it off for this read. */
  useAi?: boolean;
  /** Lets the read produce choose-all-that-apply questions. */
  multiAnswer?: boolean;
  /** Photos of the test, one per page in order; `file` is the first (R30). */
  pages?: readonly Blob[];
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
    });

  // The callable takes only a PDF or a Word file, so everything else is read here.
  if (!options.aiExtract) return inBrowser();
  // Only a teacher who could have had AI is told which reader ran.
  if (
    options.useAi === false ||
    kind === 'rtf' ||
    kind === 'cartridge' ||
    kind === 'image'
  ) {
    const extracted = await inBrowser();
    return { ...extracted, readBy: 'plain' };
  }

  try {
    const extracted = await readQuizDocumentWithAi(file, {
      fileName,
      extract: options.aiExtract,
      cropper: browserPdfCropper,
      readPdfLines: pdfTextLines,
      ...(options.multiAnswer ? { multiAnswer: true } : {}),
    });
    return { ...extracted, readBy: 'ai' };
  } catch (err) {
    // Half a quiz to fix beats an error screen mid-import.
    console.warn('[quizImport] AI reader unavailable', err);
    const extracted = await inBrowser();
    return {
      ...extracted,
      readBy: 'plain',
      warnings: [AI_READER_FELL_BACK, ...extracted.warnings],
    };
  }
}
