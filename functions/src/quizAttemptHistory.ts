// Keeps a read-only copy of every finished quiz attempt and a teacher-only score list (docs/plans/QUIZ_ATTEMPT_HISTORY.md).
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import './functionsInit';
import { loadSessionContext, stableStringify } from './gradebook/gradeIndex';
import { mergeAttempts } from './gradebook/gradeRowMath';
import type { IndexAttempt } from './gradebook/types';

type Firestore = admin.firestore.Firestore;
type Doc = Record<string, unknown>;

export const QUIZ_ATTEMPTS_SUBCOLLECTION = 'attempts';
export const QUIZ_ATTEMPT_SCORES_COLLECTION = 'attemptScores';
// An archive written this close to the delete is the removal's own; older ones belong to an earlier occupant.
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

const isCompleted = (d: Doc | undefined): d is Doc => d?.status === 'completed';

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
  if (isCompleted(before) && after.unlocked !== true) {
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

/** Writes attempt n's copy and its score entry unless a later event already did. */
async function saveAttempt(
  db: Firestore,
  w: AttemptWrite,
  data: Doc,
  n: number
): Promise<boolean> {
  const ctx = await loadSessionContext(db, 'quiz', w.sessionId);
  // Review games and resource sessions are not graded attempts.
  if (!ctx) return false;
  const studentUid = typeof data.studentUid === 'string' ? data.studentUid : '';
  const score = ctx.score(studentUid, data);
  const attemptRef = responseRef(db, w.sessionId, w.responseKey)
    .collection(QUIZ_ATTEMPTS_SUBCOLLECTION)
    .doc(String(n));
  const listRef = scoresRef(db, w.sessionId, w.responseKey);
  return db.runTransaction(async (tx) => {
    const [existing, list] = await Promise.all([
      tx.get(attemptRef),
      tx.get(listRef),
    ]);
    const prevAt: unknown = existing.data()?.eventAt;
    if (typeof prevAt === 'number' && prevAt > w.eventAt) return false;
    tx.set(attemptRef, attemptCopy(data, n, w.eventAt));
    if (score) {
      const prev: unknown = list.data()?.attempts;
      const attempts = mergeAttempts(
        Array.isArray(prev) ? (prev as IndexAttempt[]) : [],
        { ...score, attemptNumber: n }
      );
      tx.set(listRef, {
        sessionId: w.sessionId,
        studentUid,
        attempts,
        updatedAt: w.eventAt,
      });
    }
    return true;
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
    .filter((a) => a.at >= w.eventAt - ARCHIVE_MATCH_MS)
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

/** Response trigger body; failures are logged so the grade index step still runs. */
export async function applyAttemptWrite(
  db: Firestore,
  w: AttemptWrite
): Promise<void> {
  const action = attemptActionFor(w);
  try {
    switch (action.kind) {
      case 'none':
        return;
      case 'copy':
        await saveAttempt(db, w, action.data, action.n);
        return;
      case 'retake':
        await saveAttempt(db, w, action.data, action.n);
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
