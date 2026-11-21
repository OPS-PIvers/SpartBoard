import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  type DocumentReference,
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
import { responseInClass } from '@/utils/assignedStatus';
import { isLetIn } from '@/utils/periodAccess';

/** End waits out the students' 120 s write grace (`runOpen` in firestore.rules) before turning work in. */
export const END_TURN_IN_DELAY_MS = 125_000;

const SESSIONS = 'quiz_sessions';
const RESPONSES = 'responses';

/** Turns in every unfinished response of an ended quiz session, one transaction each, as every teacher End does. */
export async function finalizeOpenQuizResponses(
  sessionId: string,
  now: number = Date.now()
): Promise<void> {
  await finalizeOpen(sessionId, now, isEnded, () => true);
}

/** Turns in one closed class's unfinished responses (ASSIGNED_TAB D6); `closedAt` is the Close that scheduled it. */
export async function finalizeClassQuizResponses(
  sessionId: string,
  classKey: string,
  closedAt: number,
  now: number = Date.now()
): Promise<void> {
  // A Reopen, or a later Close with its own timer, makes this one stale.
  const gate: SessionGate = (s) => {
    const row = s?.periodAccess?.[classKey];
    return row?.state === 'closed' && row.closedAt === closedAt;
  };
  await finalizeOpen(sessionId, now, gate, (r, s) => {
    const label = s.periodAccess?.[classKey]?.label ?? '';
    return (
      responseInClass(r, classKey, label) &&
      r.unlocked !== true &&
      !(s.reopenedFor ?? []).includes(r.studentUid) &&
      !isLetIn(s, r.studentUid, now)
    );
  });
}

type SessionGate = (s: QuizSession | undefined) => boolean;

const isEnded: SessionGate = (s) => s?.status === 'ended';

async function finalizeOpen(
  sessionId: string,
  now: number,
  gate: SessionGate,
  pick: (r: QuizResponse, s: QuizSession) => boolean
): Promise<void> {
  const sessionRef = doc(db, SESSIONS, sessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) return;
  const session = sessionSnap.data() as QuizSession;
  // A Reopen during the delay wins.
  if (!gate(session)) return;
  let publicQuestions: unknown = session.publicQuestions;
  if (session.questionsInContent === true) {
    const contentSnap = await getDoc(
      doc(sessionRef, QUIZ_CONTENT_COLLECTION, QUIZ_CONTENT_DOC)
    );
    publicQuestions = (contentSnap.data() as QuizSessionContent | undefined)
      ?.publicQuestions;
  }
  const questionIds = (
    Array.isArray(publicQuestions)
      ? (publicQuestions as { id?: unknown }[])
      : []
  )
    .map((q) => q?.id)
    .filter((id): id is string => typeof id === 'string');
  const completenessModel = session.completenessModel;

  const open = await getDocs(
    query(
      collection(sessionRef, RESPONSES),
      where('status', 'in', ['joined', 'in-progress'])
    )
  );
  // A scanned written-answers row the student never opened stays open (AB-152).
  const docs = open.docs.filter((d) => {
    const r = d.data() as QuizResponse;
    return (
      pick(r, session) &&
      !(r.status === 'joined' && r.paperWrittenBatchId && !r.lastWriteAt)
    );
  });
  await turnInResponses(docs, { questionIds, completenessModel }, now, {
    whileFrozen: { ref: sessionRef, gate },
  });
}

/** Turns in each listed response from a fresh read; throws the first failure after trying them all. */
export async function turnInResponses(
  docs: readonly QueryDocumentSnapshot[],
  session: { questionIds: readonly string[]; completenessModel?: number },
  now: number,
  opts: { whileFrozen?: { ref: DocumentReference; gate: SessionGate } } = {}
): Promise<void> {
  const { whileFrozen } = opts;
  const results = await Promise.allSettled(
    docs.map((d) =>
      runTransaction(db, async (tx) => {
        // A Reopen that lands while these run wins.
        if (whileFrozen) {
          const parent = await tx.get(whileFrozen.ref);
          if (!whileFrozen.gate(parent.data() as QuizSession | undefined))
            return;
        }
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
