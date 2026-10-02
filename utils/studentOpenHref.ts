import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { KIND_CONFIG, type SessionKind } from '@/hooks/useStudentAssignments';

/** D17: the player link for a graded session that is no longer in the student's list; quizzes need their join code. */
export async function resolveStudentOpenHref(
  kind: SessionKind,
  sessionId: string
): Promise<string> {
  const config = KIND_CONFIG[kind];
  if (kind !== 'quiz') return config.hrefFrom(sessionId, {});
  const snap = await getDoc(doc(db, config.collectionName, sessionId));
  return config.hrefFrom(sessionId, snap.data() ?? {});
}
