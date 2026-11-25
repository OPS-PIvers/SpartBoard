import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { GuidedLearningResponse, GuidedLearningSession } from '@/types';
import { responseInClass } from '@/utils/assignedStatus';
import { staysOpenAtClose } from '@/utils/staysOpenAtClose';

const SESSIONS = 'guided_learning_sessions';
const RESPONSES = 'responses';

type SessionGate = (s: GuidedLearningSession | undefined) => boolean;

/** A join with no answers has nothing to turn in, so it stays Not started. */
const isBlank = (r: GuidedLearningResponse): boolean =>
  !Array.isArray(r.answers) || r.answers.length === 0;

/** Turns in one closed class's unfinished GL responses (ASSIGNED_TAB D6); `closedAt` is the Close that scheduled it. */
export async function finalizeClassGuidedLearningResponses(
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
  await finalizeOpen(sessionId, now, gate, (r, uid, s) => {
    const label = s.periodAccess?.[classKey]?.label ?? '';
    return (
      responseInClass(r, classKey, label) &&
      !staysOpenAtClose(s, { studentUid: uid }, now, { blank: isBlank(r) })
    );
  });
}

/** Turns in every unfinished GL response with answers once a whole-run End's `closeAt` still stands. */
export async function finalizeOpenGuidedLearningResponses(
  sessionId: string,
  closeAt: number,
  now: number = Date.now()
): Promise<void> {
  const gate: SessionGate = (s) => s?.closeAt === closeAt;
  await finalizeOpen(sessionId, now, gate, (r) => !isBlank(r));
}

async function finalizeOpen(
  sessionId: string,
  now: number,
  gate: SessionGate,
  pick: (
    r: GuidedLearningResponse,
    uid: string,
    s: GuidedLearningSession
  ) => boolean
): Promise<void> {
  const sessionRef = doc(db, SESSIONS, sessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) return;
  const session = sessionSnap.data() as GuidedLearningSession;
  if (!gate(session)) return;
  const all = await getDocs(collection(sessionRef, RESPONSES));
  const open = all.docs.filter((d) => {
    const r = d.data() as GuidedLearningResponse;
    return r.completedAt == null && pick(r, d.id, session);
  });
  const results = await Promise.allSettled(
    open.map((d) => turnIn(d.ref, sessionRef, gate, now))
  );
  const failed = results.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  );
  if (failed) throw failed.reason;
}

function turnIn(
  ref: DocumentReference,
  sessionRef: DocumentReference,
  gate: SessionGate,
  now: number
): Promise<void> {
  return runTransaction(db, async (tx) => {
    // A Reopen that lands while these run wins.
    const parent = await tx.get(sessionRef);
    if (!gate(parent.data() as GuidedLearningSession | undefined)) return;
    const fresh = await tx.get(ref);
    if (!fresh.exists()) return;
    if ((fresh.data() as GuidedLearningResponse).completedAt != null) return;
    tx.update(ref, { completedAt: now });
  });
}
