// Languages a live quiz session serves: the locales its public questions carry.
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  QUIZ_CONTENT_COLLECTION,
  QUIZ_CONTENT_DOC,
} from '@/utils/quizSessionContent';

type LocalizedQuestions =
  readonly { localized?: Record<string, unknown> }[] | undefined;

export function servedLocalesOf(questions: LocalizedQuestions): string[] {
  const codes = new Set<string>();
  for (const q of questions ?? [])
    for (const code of Object.keys(q.localized ?? {})) codes.add(code);
  return [...codes];
}

/** Reads the session once; a per-period session keeps its questions in the content doc. */
export async function loadServedLocales(sessionId: string): Promise<string[]> {
  const snap = await getDoc(doc(db, 'quiz_sessions', sessionId));
  const data = snap.data();
  if (data?.questionsInContent !== true)
    return servedLocalesOf(data?.publicQuestions as LocalizedQuestions);
  const content = await getDoc(
    doc(
      db,
      'quiz_sessions',
      sessionId,
      QUIZ_CONTENT_COLLECTION,
      QUIZ_CONTENT_DOC
    )
  );
  return servedLocalesOf(content.data()?.publicQuestions as LocalizedQuestions);
}
