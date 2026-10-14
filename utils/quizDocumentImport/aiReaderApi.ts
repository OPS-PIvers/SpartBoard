/**
 * The browser wiring for the AI reader: the callable itself, kept out of
 * `aiReader` so the mapping can be tested without Firebase.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { AiExtractFn, AiExtractedQuiz } from './aiReader';
import type { ExtractedTestSet } from './types';

export const extractQuizFromDocument: AiExtractFn = async (input) => {
  const callable = httpsCallable<typeof input, AiExtractedQuiz>(
    functions,
    'extractQuizFromDocumentV1',
    { timeout: 130_000 }
  );
  return (await callable(input)).data;
};

/** Looks for versions first (QUIZ_IMPORT_VERSIONS V7); a file without them comes back as a plain quiz. */
export const extractTestSetFromDocument = async (
  input: Parameters<AiExtractFn>[0]
): Promise<AiExtractedQuiz | ExtractedTestSet> => {
  const callable = httpsCallable<
    Parameters<AiExtractFn>[0] & { versions: true },
    AiExtractedQuiz | ExtractedTestSet
  >(functions, 'extractQuizFromDocumentV1', { timeout: 250_000 });
  return (await callable({ ...input, versions: true })).data;
};
