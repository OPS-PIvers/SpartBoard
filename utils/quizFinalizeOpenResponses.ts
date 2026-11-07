import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizResponse, QuizSession } from '@/types';
import {
  QUIZ_CONTENT_COLLECTION,
  QUIZ_CONTENT_DOC,
  type QuizSessionContent,
} from '@/utils/quizSessionContent';
import { buildTeacherSubmitUpdate } from '@/utils/quizTeacherSubmit';

/** How long End waits before turning work in, so a student's last autosave lands first. */
export const END_TURN_IN_DELAY_MS = 10_000;

const SESSIONS = 'quiz_sessions';
const RESPONSES = 'responses';

/** Turns in every unfinished response of an ended quiz session, one transaction each, as every teacher End does. */
export async function finalizeOpenQuizResponses(
  sessionId: string,
  now: number = Date.now()
): Promise<void> {
  const sessionRef = doc(db, SESSIONS, sessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) return;
  const session = sessionSnap.data() as QuizSession;
  // A Reopen during the delay wins.
  if (session.status !== 'ended') return;
  let publicQuestions = session.publicQuestions;
  if (session.questionsInContent === true) {
    const contentSnap = await getDoc(
      doc(sessionRef, QUIZ_CONTENT_COLLECTION, QUIZ_CONTENT_DOC)
    );
    publicQuestions = (contentSnap.data() as QuizSessionContent | undefined)
      ?.publicQuestions;
  }
  const questionIds = (Array.isArray(publicQuestions) ? publicQuestions : [])
    .map((q) => q?.id)
    .filter((id): id is string => typeof id === 'string');
  const completenessModel = session.completenessModel;

  const open = await getDocs(
    query(
      collection(sessionRef, RESPONSES),
      where('status', 'in', ['joined', 'in-progress'])
    )
  );
  // A scanned written-answers row the student never opened stays open (AB-133).
  const docs = open.docs.filter((d) => {
    const r = d.data() as QuizResponse;
    return !(r.status === 'joined' && r.paperWrittenBatchId && !r.lastWriteAt);
  });
  await turnInResponses(docs, { questionIds, completenessModel }, now);
}

/** Turns in each listed response from a fresh read; throws the first failure after trying them all. */
export async function turnInResponses(
  docs: readonly QueryDocumentSnapshot[],
  session: { questionIds: readonly string[]; completenessModel?: number },
  now: number
): Promise<void> {
  const results = await Promise.allSettled(
    docs.map((d) =>
      runTransaction(db, async (tx) => {
        const fresh = await tx.get(d.ref);
        if (!fresh.exists()) return;
        const update = buildTeacherSubmitUpdate(
          fresh.data() as QuizResponse,
          session,
          now
        );
        if (update) tx.update(d.ref, update);
      })
    )
  );
  const failed = results.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  );
  if (failed) throw failed.reason;
}
