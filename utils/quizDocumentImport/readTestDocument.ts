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
import { browserPdfCropper } from './pdfCropBrowser';

export const AI_READER_FELL_BACK =
  'The document was read the simple way because the smarter reader wasn’t available. Check the questions and answers below.';

export interface ReadTestDocumentOptions {
  /** Supplied only when the teacher has AI access; absent means browser-only. */
  aiExtract?: AiExtractFn;
}

export async function readTestDocument(
  file: Blob,
  fileName: string,
  options: ReadTestDocumentOptions = {}
): Promise<ExtractedQuiz> {
  // pdf.js and tesseract are only loaded when the file is a PDF, so a Word
  // import never pays for them.
  const kind = documentKind(file, fileName);
  const inBrowser = async (): Promise<ExtractedQuiz> =>
    readQuizDocument(file, {
      fileName,
      ...(kind === 'pdf' ? { pdf: await browserPdfDeps(file) } : {}),
    });

  // Rich text goes straight to the plain reader: the callable takes a PDF or a
  // Word file, and an .rtf states its own paragraphs and emphasis anyway.
  if (!options.aiExtract || kind === 'rtf') return inBrowser();

  try {
    return await readQuizDocumentWithAi(file, {
      fileName,
      extract: options.aiExtract,
      cropper: browserPdfCropper,
    });
  } catch (err) {
    // Half a quiz to fix beats an error screen mid-import.
    console.warn('[quizImport] AI reader unavailable', err);
    const extracted = await inBrowser();
    return {
      ...extracted,
      warnings: [AI_READER_FELL_BACK, ...extracted.warnings],
    };
  }
}
