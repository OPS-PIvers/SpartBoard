// Keeps a read-only copy of every finished quiz attempt and a teacher-only score list (docs/plans/QUIZ_ATTEMPT_HISTORY.md).
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import './functionsInit';
import { loadSessionContext, stableStringify } from './gradebook/gradeIndex';
import { mergeAttempts } from './gradebook/gradeRowMath';
import { isGlobalFeatureGranted } from './quizMediaArchive';
import type { IndexAttempt } from './gradebook/types';

type Firestore = admin.firestore.Firestore;
type Doc = Record<string, unknown>;

export const QUIZ_ATTEMPTS_SUBCOLLECTION = 'attempts';
export const QUIZ_ATTEMPT_SCORES_COLLECTION = 'attemptScores';
// An archive this close to the delete (either way, for clock skew) is the removal's own; older ones belong to an earlier occupant.
const ARCHIVE_MATCH_MS = 10 * 60_000;

/** Response fields an attempt copy keeps; everything else is live-session state. */
const COPIED_FIELDS = [
  'studentUid',
  'pin',
  'classPeriod',
  'classId',
  'joinedAt',
  'attemptStartedAt',
  'answers',
  'servedQuestionIds',
  'submittedAt',
  'autoSubmitted',
  'timeUp',
  'score',
  'grading',
  'tabSwitchWarnings',
  'tabExits',
  'artifactArchive',
  'preSyncVersion',
] as const;

/** Changes to a finished attempt that its copy must follow (grading, publish, finalize). */
const WATCHED_WHILE_DONE = [
  'status',
  'completedAttempts',
  'answers',
  'grading',
  'score',
  'submittedAt',
  'servedQuestionIds',
  'tabExits',
] as const;

export interface AttemptWrite {
  sessionId: string;
  responseKey: string;
  before: Doc | undefined;
  after: Doc | undefined;
  /** Event time in ms; orders out-of-order deliveries for the same attempt. */
  eventAt: number;
}

export type AttemptAction =
  | { kind: 'none' }
  | { kind: 'copy'; data: Doc; n: number }
  | { kind: 'retake'; data: Doc; n: number }
  | { kind: 'removed' };

const isCompleted = (d: Doc | undefined): boolean => d?.status === 'completed';

/** The attempt number a completed response holds; legacy docs count as attempt 1. */
export function attemptNumberOf(d: Doc): number {
  const n = d.completedAttempts;
  return typeof n === 'number' && Number.isFinite(n) && n >= 1
    ? Math.floor(n)
    : 1;
}

/** What one response write means for the attempt history. */
export function attemptActionFor(w: AttemptWrite): AttemptAction {
  const { before, after } = w;
  if (!after) return before ? { kind: 'removed' } : { kind: 'none' };
  if (isCompleted(after)) {
    const changed =
      !before ||
      WATCHED_WHILE_DONE.some(
        (f) => stableStringify(before[f]) !== stableStringify(after[f])
      );
    return changed
      ? { kind: 'copy', data: after, n: attemptNumberOf(after) }
      : { kind: 'none' };
  }
  // A teacher reopen keeps the answers and sets `unlocked`; only a real retake resets.
  if (before && isCompleted(before) && after.unlocked !== true) {
    return { kind: 'retake', data: before, n: attemptNumberOf(before) };
  }
  return { kind: 'none' };
}

/** The stored copy of one attempt. */
export function attemptCopy(data: Doc, n: number, eventAt: number): Doc {
  const copy: Doc = { n, eventAt };
  for (const f of COPIED_FIELDS) {
    if (data[f] !== undefined) copy[f] = data[f];
  }
  return copy;
}

const responseRef = (db: Firestore, sessionId: string, responseKey: string) =>
  db
    .collection('quiz_sessions')
    .doc(sessionId)
    .collection('responses')
    .doc(responseKey);

const scoresRef = (db: Firestore, sessionId: string, responseKey: string) =>
  db
    .collection('quiz_sessions')
    .doc(sessionId)
    .collection(QUIZ_ATTEMPT_SCORES_COLLECTION)
    .doc(responseKey);

export interface CopyStamp {
  n: number;
  closed: boolean;
  submittedAt: unknown;
}

/** Which copy an attempt belongs to; legacy docs whose count lags reuse a closed number, so they move past it. */
export function pickAttemptNumber(
  copies: CopyStamp[],
  n: number,
  submittedAt: unknown
): number {
  if (submittedAt != null) {
    const same = copies.find(
      (c) => stableStringify(c.submittedAt) === stableStringify(submittedAt)
    );
    if (same) return same.n;
  }
  const at = copies.find((c) => c.n === n);
  if (!at || !at.closed) return n;
  const top = copies.reduce((a, b) => (b.n > a.n ? b : a));
  return top.closed ? top.n + 1 : top.n;
}

export type SaveResult = 'written' | 'newer' | 'skipped';

/** Writes an attempt's copy and score entry unless a later event already did; a retake also closes the copy. */
async function saveAttempt(
  db: Firestore,
  w: AttemptWrite,
  data: Doc,
  n: number,
  close: boolean
): Promise<SaveResult> {
  const ctx = await loadSessionContext(db, 'quiz', w.sessionId);
  // Review games and resource sessions are not graded attempts.
  if (!ctx) return 'skipped';
  const studentUid = typeof data.studentUid === 'string' ? data.studentUid : '';
  const score = ctx.score(studentUid, data);
  const liveRef = responseRef(db, w.sessionId, w.responseKey);
  const copies = (
    await liveRef.collection(QUIZ_ATTEMPTS_SUBCOLLECTION).get()
  ).docs.map((d): CopyStamp => {
    const c = d.data() ?? {};
    return {
      n: Number(c.n) || Number(d.id) || 0,
      closed: c.closed === true,
      submittedAt: c.submittedAt,
    };
  });
  const target = pickAttemptNumber(copies, n, data.submittedAt);
  const attemptRef = liveRef
    .collection(QUIZ_ATTEMPTS_SUBCOLLECTION)
    .doc(String(target));
  const listRef = scoresRef(db, w.sessionId, w.responseKey);
  return db.runTransaction(async (tx) => {
    const [live, existing, list] = await Promise.all([
      tx.get(liveRef),
      tx.get(attemptRef),
      tx.get(listRef),
    ]);
    // A late event for a response already removed must not leave an orphan copy.
    if (!live.exists) return 'skipped';
    const prev: Doc | undefined = existing.data();
    // A closed copy is frozen; only a teacher grade on it changes it afterwards.
    if (prev?.closed === true) return 'newer';
    if (typeof prev?.eventAt === 'number' && prev.eventAt > w.eventAt)
      return 'newer';
    tx.set(attemptRef, {
      ...attemptCopy(data, target, w.eventAt),
      ...(close || prev?.closed === true ? { closed: true } : {}),
    });
    if (score) {
      const entries: unknown = list.data()?.attempts;
      const attempts = mergeAttempts(
        Array.isArray(entries) ? (entries as IndexAttempt[]) : [],
        { ...score, attemptNumber: target }
      );
      tx.set(listRef, {
        sessionId: w.sessionId,
        studentUid,
        attempts,
        updatedAt: w.eventAt,
      });
    }
    return 'written';
  });
}

/** A retake leaves the last attempt's teacher grades behind; they now live only on its copy. */
async function clearCarriedGrades(
  db: Firestore,
  w: AttemptWrite,
  before: Doc
): Promise<void> {
  const ref = responseRef(db, w.sessionId, w.responseKey);
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data();
    if (!fresh || isCompleted(fresh) || fresh.unlocked === true) return;
    if (fresh.completedAttempts !== before.completedAttempts) return;
    if (fresh.grading === undefined) return;
    if (stableStringify(fresh.grading) !== stableStringify(before.grading))
      return;
    tx.update(ref, { grading: admin.firestore.FieldValue.delete() });
  });
}

/** A removed student's attempts follow their `archived_responses` copy; otherwise they go. */
async function moveRemovedAttempts(
  db: Firestore,
  w: AttemptWrite
): Promise<void> {
  const session = db.collection('quiz_sessions').doc(w.sessionId);
  const attempts = await responseRef(db, w.sessionId, w.responseKey)
    .collection(QUIZ_ATTEMPTS_SUBCOLLECTION)
    .get();
  const list = await scoresRef(db, w.sessionId, w.responseKey).get();
  if (attempts.docs.length === 0 && !list.exists) return;
  // Sorted here rather than with orderBy, which would need a composite index.
  const archive = (
    await session
      .collection('archived_responses')
      .where('originalResponseKey', '==', w.responseKey)
      .get()
  ).docs
    .map((d) => ({ d, at: Number(d.data()?.archivedAt) || 0 }))
    .filter((a) => Math.abs(a.at - w.eventAt) <= ARCHIVE_MATCH_MS)
    .sort((a, b) => b.at - a.at)[0]?.d;
  for (const d of attempts.docs) {
    if (archive) {
      await archive.ref
        .collection(QUIZ_ATTEMPTS_SUBCOLLECTION)
        .doc(d.id)
        .set(d.data() ?? {});
    }
    await d.ref.delete();
  }
  if (list.exists) {
    if (archive) {
      const scores: unknown = list.data()?.attempts;
      await archive.ref.set(
        { attemptScores: Array.isArray(scores) ? scores : [] },
        { merge: true }
      );
    }
    await list.ref.delete();
  }
}

export interface AttemptGradeWrite {
  sessionId: string;
  responseKey: string;
  n: number;
  before: Doc | undefined;
  after: Doc | undefined;
}

/** A teacher grade on an earlier attempt's copy rescores that attempt's entry. */
export async function applyAttemptGradeWrite(
  db: Firestore,
  w: AttemptGradeWrite
): Promise<void> {
  const { before, after } = w;
  if (!before || !after || after.closed !== true) return;
  if (stableStringify(before.grading) === stableStringify(after.grading))
    return;
  try {
    const ctx = await loadSessionContext(db, 'quiz', w.sessionId);
    if (!ctx) return;
    const copyRef = responseRef(db, w.sessionId, w.responseKey)
      .collection(QUIZ_ATTEMPTS_SUBCOLLECTION)
      .doc(String(w.n));
    const listRef = scoresRef(db, w.sessionId, w.responseKey);
    await db.runTransaction(async (tx) => {
      const [copySnap, list] = await Promise.all([
        tx.get(copyRef),
        tx.get(listRef),
      ]);
      // Score the copy as it is now, so out-of-order events settle on the latest grade.
      const fresh: Doc | undefined = copySnap.data();
      // No list means the response was removed or never scored.
      if (!fresh || !list.exists) return;
      const studentUid =
        typeof fresh.studentUid === 'string' ? fresh.studentUid : '';
      // A stored (published) score would mask the new grade.
      const score = ctx.score(studentUid, {
        ...fresh,
        score: null,
        status: 'completed',
      });
      if (!score) return;
      const entries: unknown = list.data()?.attempts;
      tx.set(listRef, {
        ...list.data(),
        attempts: mergeAttempts(
          Array.isArray(entries) ? (entries as IndexAttempt[]) : [],
          { ...score, attemptNumber: w.n }
        ),
        updatedAt: Date.now(),
      });
    });
  } catch (err) {
    logger.error('quizAttemptHistory: grade rescore failed', {
      sessionId: w.sessionId,
      responseKey: w.responseKey,
      n: w.n,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Whether the session's teacher has attempt history, which is what lets them see grades moved off the live doc. */
async function teacherHasAttemptHistory(
  db: Firestore,
  sessionId: string
): Promise<boolean> {
  const teacherUid: unknown = (
    await db.collection('quiz_sessions').doc(sessionId).get()
  ).data()?.teacherUid;
  if (typeof teacherUid !== 'string' || !teacherUid) return false;
  let email: string | null = null;
  try {
    email = (await admin.auth().getUser(teacherUid)).email ?? null;
  } catch {
    email = null;
  }
  return isGlobalFeatureGranted(db, 'quiz-attempt-history', email, teacherUid);
}

/** Response trigger body; failures are logged so the grade index step still runs. */
export async function applyAttemptWrite(
  db: Firestore,
  w: AttemptWrite,
  historyOn: (
    db: Firestore,
    sessionId: string
  ) => Promise<boolean> = teacherHasAttemptHistory
): Promise<void> {
  const action = attemptActionFor(w);
  try {
    switch (action.kind) {
      case 'none':
        return;
      case 'copy':
        await saveAttempt(db, w, action.data, action.n, false);
        return;
      case 'retake':
        // Grades leave the live doc only once a copy holds them and the teacher can see that copy.
        if (
          (await saveAttempt(db, w, action.data, action.n, true)) !==
            'skipped' &&
          (await historyOn(db, w.sessionId))
        )
          await clearCarriedGrades(db, w, action.data);
        return;
      case 'removed':
        await moveRemovedAttempts(db, w);
        return;
    }
  } catch (err) {
    logger.error('quizAttemptHistory: write failed', {
      sessionId: w.sessionId,
      responseKey: w.responseKey,
      action: action.kind,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
