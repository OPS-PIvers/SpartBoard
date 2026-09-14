import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

export interface BackTranslationResult {
  text: string;
  model: string;
}

/** One `translateResponseV1` call: the teacher-side back-translation of a student's answer. */
export async function requestBackTranslation(
  text: string,
  sourceLocale: string
): Promise<BackTranslationResult> {
  const callable = httpsCallable<
    { text: string; sourceLocale: string },
    BackTranslationResult
  >(functions, 'translateResponseV1');
  const { data } = await callable({ text, sourceLocale });
  return data;
}
