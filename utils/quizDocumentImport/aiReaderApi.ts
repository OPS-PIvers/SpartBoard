/**
 * The browser wiring for the AI reader: the callable itself, kept out of
 * `aiReader` so the mapping can be tested without Firebase.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { AiExtractFn, AiExtractedQuiz } from './aiReader';

export const extractQuizFromDocument: AiExtractFn = async (input) => {
  const callable = httpsCallable<typeof input, AiExtractedQuiz>(
    functions,
    'extractQuizFromDocumentV1'
  );
  return (await callable(input)).data;
};
