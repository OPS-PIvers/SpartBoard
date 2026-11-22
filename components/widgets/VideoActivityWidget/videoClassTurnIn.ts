import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { VideoActivityResponse, VideoActivitySession } from '@/types';
import { responseInClass } from '@/utils/assignedStatus';
import { isLetIn } from '@/utils/periodAccess';
import { completionPatch } from '@/utils/videoActivityState';

const SESSIONS = 'video_activity_sessions';
const RESPONSES = 'responses';

type Gate = (s: VideoActivitySession | undefined) => boolean;

/** Turns in one closed class's unfinished video attempts (ASSIGNED_TAB D6); `closedAt` is the Close that scheduled it. */
export async function finalizeClassVideoResponses(
  sessionId: string,
  classKey: string,
  closedAt: number,
  now: number = Date.now()
): Promise<void> {
  // A Reopen, or a later Close with its own timer, makes this one stale.
  const gate: Gate = (s) => {
    const row = s?.periodAccess?.[classKey];
    return row?.state === 'closed' && row.closedAt === closedAt;
  };
  const sessionRef = doc(db, SESSIONS, sessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) return;
  const session = sessionSnap.data() as VideoActivitySession;
  if (!gate(session)) return;
  const label = session.periodAccess?.[classKey]?.label ?? '';

  const open = await getDocs(
    query(collection(sessionRef, RESPONSES), where('completedAt', '==', null))
  );
  // A blank join stays Not started: turning it in would spend an attempt on nothing.
  const picked = open.docs.filter((d) => {
    const r = d.data() as VideoActivityResponse;
    return (
      responseInClass(r, classKey, label) &&
      r.unlocked !== true &&
      !(session.reopenedFor ?? []).includes(r.studentUid) &&
      !isLetIn(session, r.studentUid, now) &&
      Array.isArray(r.answers) &&
      r.answers.length > 0
    );
  });

  const results = await Promise.allSettled(
    picked.map((d) =>
      runTransaction(db, async (tx) => {
        // A Reopen that lands while these run wins.
        const parent = await tx.get(sessionRef);
        if (!gate(parent.data() as VideoActivitySession | undefined)) return;
        const fresh = await tx.get(d.ref);
        if (!fresh.exists()) return;
        const r = fresh.data() as VideoActivityResponse;
        if (r.unlocked === true) return;
        const patch = completionPatch(r, now, {
          increment: (n: number) => (r.completedAttempts ?? 0) + n,
        });
        if (patch) tx.update(d.ref, patch);
      })
    )
  );
  const failed = results.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  );
  if (failed) throw failed.reason;
}

/** Turns in a closed single-line run's unfinished attempts; `closedAt` is the assignment's close mark, so a Reopen or Undo voids it. */
export async function finalizeRunVideoResponses(
  sessionId: string,
  teacherUid: string,
  closedAt: number,
  now: number = Date.now()
): Promise<void> {
  const sessionRef = doc(db, SESSIONS, sessionId);
  const assignmentRef = doc(
    db,
    'users',
    teacherUid,
    'video_activity_assignments',
    sessionId
  );
  const marked = (a: { closedAt?: number | null } | undefined) =>
    a?.closedAt === closedAt;
  if (!marked((await getDoc(assignmentRef)).data())) return;
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) return;
  const session = sessionSnap.data() as VideoActivitySession;
  const open = await getDocs(
    query(collection(sessionRef, RESPONSES), where('completedAt', '==', null))
  );
  // A blank join stays Not started: turning it in would spend an attempt on nothing.
  const picked = open.docs.filter((d) => {
    const r = d.data() as VideoActivityResponse;
    return (
      r.unlocked !== true &&
      !(session.reopenedFor ?? []).includes(r.studentUid) &&
      Array.isArray(r.answers) &&
      r.answers.length > 0
    );
  });
  const results = await Promise.allSettled(
    picked.map((d) =>
      runTransaction(db, async (tx) => {
        // A Reopen or Undo that lands while these run wins.
        const a = await tx.get(assignmentRef);
        if (!marked(a.data())) return;
        const fresh = await tx.get(d.ref);
        if (!fresh.exists()) return;
        const r = fresh.data() as VideoActivityResponse;
        if (r.unlocked === true) return;
        const patch = completionPatch(r, now, {
          increment: (n: number) => (r.completedAttempts ?? 0) + n,
        });
        if (patch) tx.update(d.ref, patch);
      })
    )
  );
  const failed = results.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  );
  if (failed) throw failed.reason;
}
