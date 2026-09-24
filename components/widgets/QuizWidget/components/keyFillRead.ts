/** Reading a key file on its own into a fill for the review (R17). */

import type { QuizQuestion } from '@/types';
import {
  fillSavedQuizKey,
  type SavedKeyFill,
} from '@/utils/quizDocumentImport';
import { readKeyDocument } from '@/utils/quizDocumentImport/readTestAndKey';
import type { KeyItem } from '@/utils/quizDocumentImport/types';
import type { UploadedDocument } from '@/utils/quizDocumentImport/uploadIntake';

export type ReadKeyFile = (
  key: UploadedDocument,
  multiAnswer: boolean
) => Promise<KeyItem[]>;

export type FillFromKey = (
  questions: readonly QuizQuestion[],
  items: readonly KeyItem[]
) => SavedKeyFill;

/** Reads the key and works out the fill; the quiz itself is untouched. */
export async function readKeyFill(
  questions: readonly QuizQuestion[],
  key: UploadedDocument,
  readKey: ReadKeyFile = readKeyDocument,
  fill: FillFromKey = fillSavedQuizKey
): Promise<SavedKeyFill> {
  const multiAnswer = questions.some((q) => q.needsKey && q.type === 'MA');
  return fill(questions, await readKey(key, multiAnswer));
}

export const keyFillLabel = (n: number) =>
  n === 1 ? 'Fill 1 answer' : `Fill ${n} answers`;
