import type * as admin from './firebaseAdmin';

/** The uid holding `quiz_join_codes/{code}` (the code's one owner), or null if unclaimed. */
export async function quizJoinCodeOwner(
  db: admin.firestore.Firestore,
  normCode: string
): Promise<string | null> {
  if (!normCode) return null;
  const snap = await db.collection('quiz_join_codes').doc(normCode).get();
  const owner: unknown = snap.exists ? snap.data()?.teacherUid : null;
  return typeof owner === 'string' && owner ? owner : null;
}
