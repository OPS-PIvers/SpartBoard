/**
 * Picking a reader for a test document (D1), in one place so the import
 * wizard and the paper stub's "Import questions" (D17) read a file the same
 * way — a teacher who imports a PDF one way and fills a stub the other should
 * not get two different readings of the same paper.
 */

import { readQuizDocument } from './index';
import { readQuizDocumentWithAi, type AiExtractFn } from './aiReader';
import type { ExtractedQuiz } from './types';
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
  const inBrowser = async (): Promise<ExtractedQuiz> => {
    const isPdf =
      file.type === 'application/pdf' ||
      fileName.toLowerCase().endsWith('.pdf');
    return readQuizDocument(file, {
      fileName,
      ...(isPdf ? { pdf: await browserPdfDeps(file) } : {}),
    });
  };

  if (!options.aiExtract) return inBrowser();

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
