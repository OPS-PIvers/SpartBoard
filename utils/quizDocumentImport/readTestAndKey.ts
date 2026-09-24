/**
 * A test and its optional answer key file, read the same way from every
 * screen that has the two drop zones (docs/plans/QUIZ_IMPORT_RELIABILITY.md R14).
 */

import { applyAnswerKey, readAnswerKeyFile } from './index';
import { documentKind } from './fileKind';
import { assertWithinByteLimit } from './limits';
import { browserPdfDeps } from './pdfBrowserDeps';
import { browserImageDeps } from './imageBrowserDeps';
import {
  readTestDocument,
  type ReadTestDocumentOptions,
} from './readTestDocument';
import type { ExtractedQuiz } from './types';
import type { UploadedDocument } from './uploadIntake';

export const KEY_FILE_UNREADABLE =
  'The answer key file couldn’t be read, so the answers below are only the ones printed on the test.';

const allPages = (doc: UploadedDocument): Blob[] => doc.pages ?? [doc.file];

/** A key file is numbers and letters, which the plain reader handles (D8). */
export async function readKeyDocument(
  key: UploadedDocument,
  multiAnswer = false
): Promise<Map<number, string>> {
  const kind = documentKind(key.file, key.fileName);
  return readAnswerKeyFile(key.file, {
    fileName: key.fileName,
    ...(kind === 'pdf' ? { pdf: await browserPdfDeps(key.file) } : {}),
    ...(kind === 'image' ? { pdf: browserImageDeps(allPages(key)) } : {}),
    ...(multiAnswer ? { multiAnswer } : {}),
  });
}

/** A key that won't open is a note on the review, never a lost read of the test. */
async function withAnswerKey(
  quiz: ExtractedQuiz,
  key: UploadedDocument,
  multiAnswer: boolean
): Promise<ExtractedQuiz> {
  try {
    return applyAnswerKey(
      quiz,
      await readKeyDocument(key, multiAnswer),
      'file',
      { multiAnswer }
    );
  } catch (err) {
    console.warn('[quizImport] could not read the answer key', err);
    return { ...quiz, warnings: [...quiz.warnings, KEY_FILE_UNREADABLE] };
  }
}

export interface ReadTestAndKeyOptions extends Omit<
  ReadTestDocumentOptions,
  'pages'
> {
  key?: UploadedDocument | null;
}

export async function readTestAndKey(
  test: UploadedDocument,
  { key, ...options }: ReadTestAndKeyOptions = {}
): Promise<ExtractedQuiz> {
  // D18's budget covers the import, not each file.
  assertWithinByteLimit(...allPages(test), ...(key ? allPages(key) : []));
  const read = await readTestDocument(test.file, test.fileName, {
    ...options,
    ...(test.pages ? { pages: test.pages } : {}),
  });
  return key ? withAnswerKey(read, key, options.multiAnswer === true) : read;
}

/** What a screen with the two drop zones is handed to read them. */
export type ReadUploadedTest = (
  test: UploadedDocument,
  options?: { useAi?: boolean; key?: UploadedDocument | null }
) => Promise<ExtractedQuiz>;
