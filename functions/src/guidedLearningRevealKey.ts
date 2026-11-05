// Gives a student who submits after a Guided Learning answers-level publish the key, from the teacher-only assignment doc.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from './firebaseAdmin';
import './functionsInit';

type Doc = Record<string, unknown>;

const ANSWERS_LEVEL = 'score-responses-and-answers';

const isRecord = (v: unknown): v is Doc =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Writes the key onto a response that just turned in while the class sees answers; true when it wrote. */
export async function applyLateRevealKey(
  db: admin.firestore.Firestore,
  sessionId: string,
  docId: string,
  before: Doc | undefined,
  after: Doc | undefined
): Promise<boolean> {
  if (!after || typeof after.completedAt !== 'number') return false;
  if (typeof before?.completedAt === 'number') return false;
  if (after.revealedAnswers != null) return false;
  const sessionRef = db.collection('guided_learning_sessions').doc(sessionId);
  const session: Doc = (await sessionRef.get()).data() ?? {};
  if (session.scoreVisibility !== ANSWERS_LEVEL) return false;
  const teacherUid: unknown = session.teacherUid;
  if (typeof teacherUid !== 'string' || teacherUid === '') return false;
  const assignment: Doc =
    (
      await db
        .collection('users')
        .doc(teacherUid)
        .collection('guided_learning_assignments')
        .doc(sessionId)
        .get()
    ).data() ?? {};
  const key: unknown = assignment.revealedAnswers;
  if (
    assignment.scoreVisibility !== ANSWERS_LEVEL ||
    !isRecord(key) ||
    Object.keys(key).length === 0
  )
    return false;
  await sessionRef
    .collection('responses')
    .doc(docId)
    .update({ revealedAnswers: key });
  return true;
}

interface Change {
  before: { exists: boolean; data: () => Doc | undefined };
  after: { exists: boolean; data: () => Doc | undefined };
}

const dataOf = (side: Change['before'] | undefined): Doc | undefined =>
  side?.exists ? (side.data() ?? undefined) : undefined;

export const guidedLearningLateRevealKey = onDocumentWritten(
  {
    document: 'guided_learning_sessions/{sessionId}/responses/{docId}',
    memory: '256MiB',
    maxInstances: 20,
  },
  async (event) => {
    const change = event.data as unknown as Change | undefined;
    try {
      await applyLateRevealKey(
        admin.firestore(),
        event.params.sessionId,
        event.params.docId,
        dataOf(change?.before),
        dataOf(change?.after)
      );
    } catch (error) {
      console.error('[guidedLearningLateRevealKey] failed', {
        sessionId: event.params.sessionId,
        error,
      });
    }
  }
);
