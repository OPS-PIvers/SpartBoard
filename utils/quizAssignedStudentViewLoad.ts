import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizSession } from '@/types';
import { normalizeQuizSession } from '@/utils/quizQuestionNormalize';
import {
  QUIZ_CONTENT_COLLECTION,
  QUIZ_CONTENT_DOC,
  type QuizSessionContent,
} from '@/utils/quizSessionContent';
import {
  buildAssignedStudentView,
  type AssignedStudentView,
} from '@/utils/quizStudentViewSession';

/** One-time read of a running assignment's frozen copy; null when the session is gone. */
export async function loadAssignedStudentView(
  sessionId: string
): Promise<AssignedStudentView | null> {
  const sessionRef = doc(db, 'quiz_sessions', sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) return null;
  const raw = normalizeQuizSession({
    ...(snap.data() as QuizSession),
    id: snap.id,
  });
  let content: QuizSessionContent | null = null;
  if (raw.questionsInContent === true) {
    const contentSnap = await getDoc(
      doc(sessionRef, QUIZ_CONTENT_COLLECTION, QUIZ_CONTENT_DOC)
    );
    if (!contentSnap.exists()) throw new Error('Quiz content is missing');
    content = contentSnap.data() as QuizSessionContent;
  }
  return buildAssignedStudentView(raw, content);
}
