// One server turn-in queue for every kind: a class Close, a run End, a sub End or a Guided Learning close queues a marker, and the sweep turns open work in when no teacher tab did.
import { createHash } from 'node:crypto';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from './firebaseAdmin';
import { staysOpenAtClose } from './staysOpenAtClose';
import { buildQuizFinalizeUpdate, sessionQuestionIds } from './quizFinalize';
import { withQuizSessionContent } from './quizSessionContent';
import { withServerTurnIn } from './quizTurnIn';
import { toMillis } from './gradebook/gradeRowMath';
import { serverTurnInGranted } from './featureGrant';

type Firestore = admin.firestore.Firestore;
type DocRef = admin.firestore.DocumentReference;
type Doc = Record<string, unknown>;

export type TurnInKind = 'quiz' | 'videoActivity' | 'guidedLearning';
/** A class Close turns in that class; a run End turns in the whole run. */
export type TurnInScope = 'class' | 'run';

export const SESSIONS: Record<TurnInKind, string> = {
  quiz: 'quiz_sessions',
  videoActivity: 'video_activity_sessions',
  guidedLearning: 'guided_learning_sessions',
};
const VA_ASSIGNMENTS = 'video_activity_assignments';
export const TURN_INS = 'video_class_turn_ins';

/** Mirrors END_TURN_IN_DELAY_MS (utils/quizFinalizeOpenResponses.ts): the write grace plus a margin. */
export const TURN_IN_DELAY_MS = 125_000;

/** A Guided Learning closeAt this close to the server's time is a Close now, not a scheduled close. */
export const CLOSE_NOW_SLACK_MS = 5 * 60_000;

/** A marker that keeps failing is dropped after this long. */
export const GIVE_UP_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** A failed marker waits this long times its attempt count, capped, so it can't crowd newer ones out. */
export const RETRY_BACKOFF_MS = 15 * 60 * 1000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

export const MAX_MARKERS_PER_RUN = 100;

interface Row {
  state?: unknown;
  closedAt?: unknown;
  label?: unknown;
}

interface MarkerRef {
  kind: TurnInKind;
  scope: TurnInScope;
  sessionId: string;
  /** Empty for a run marker. */
  classKey: string;
  /** The close or end stamp the marker is for; a Reopen or a later Close changes it. */
  closedAt: number;
}

function rowsOf(session: Doc | undefined): Record<string, Row> {
  const rows = session?.periodAccess;
  return rows && typeof rows === 'object' ? (rows as Record<string, Row>) : {};
}

/** A Video Activity class marker keeps its first id so markers queued before kinds existed still match. */
export function markerId(
  sessionId: string,
  classKey: string,
  kind: TurnInKind = 'videoActivity',
  scope: TurnInScope = 'class'
): string {
  const key =
    kind === 'videoActivity' && scope === 'class'
      ? `${sessionId}\n${classKey}`
      : `${kind}\n${scope}\n${sessionId}\n${classKey}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 40);
}

/** Classes this write closed, keyed to their new closedAt; only the Assigned tab's Close stamps closedAt. */
export function newlyClosed(
  before: Doc | undefined,
  after: Doc | undefined
): Array<[string, number]> {
  const was = rowsOf(before);
  const out: Array<[string, number]> = [];
  for (const [key, row] of Object.entries(rowsOf(after))) {
    if (row?.state !== 'closed' || typeof row.closedAt !== 'number') continue;
    const prev = was[key];
    if (prev?.state === 'closed' && prev.closedAt === row.closedAt) continue;
    out.push([key, row.closedAt]);
  }
  return out;
}

/** The end stamp this write gave the whole run, or null when it did not end it. */
export function newlyEnded(
  kind: TurnInKind,
  before: Doc | undefined,
  after: Doc | undefined,
  serverNow: number
): number | null {
  if (!after) return null;
  if (kind === 'guidedLearning') {
    const closeAt = after.closeAt;
    if (typeof closeAt !== 'number' || closeAt === before?.closeAt) return null;
    // A future close is a schedule; students with their own later close read it off their pointer.
    return closeAt <= serverNow + CLOSE_NOW_SLACK_MS ? closeAt : null;
  }
  if (kind !== 'quiz' || after.status !== 'ended') return null;
  const endedAt = toMillis(after.endedAt);
  if (endedAt === null) return null;
  if (before?.status === 'ended' && toMillis(before.endedAt) === endedAt)
    return null;
  return endedAt;
}

function passesOf(session: Doc | undefined): Record<string, number> {
  const a = session?.studentAccess;
  const out: Record<string, number> = {};
  if (a && typeof a === 'object')
    for (const [uid, v] of Object.entries(a as Doc))
      if (typeof v === 'number') out[uid] = v;
  return out;
}

function reopenedOf(session: Doc | undefined): string[] {
  const r = session?.reopenedFor;
  return Array.isArray(r)
    ? r.filter((x): x is string => typeof x === 'string')
    : [];
}

/** Writes a fresh marker unless a newer Close (by server time) already holds the id. */
function writeMarker(
  db: Firestore,
  m: MarkerRef,
  serverNow: number,
  extra: Doc = {}
): Promise<void> {
  const ref = db
    .collection(TURN_INS)
    .doc(markerId(m.sessionId, m.classKey, m.kind, m.scope));
  // A retried or late event for an older Close must not replace a newer one.
  return db.runTransaction(async (tx) => {
    const prev = (await tx.get(ref)).data();
    if (
      typeof prev?.serverClosedAt === 'number' &&
      prev.serverClosedAt > serverNow
    )
      return;
    tx.set(ref, {
      ...m,
      serverClosedAt: serverNow,
      queuedAt: serverNow,
      attempts: 0,
      dueAt: serverNow + TURN_IN_DELAY_MS,
      ...extra,
    });
  });
}

/** When a pass granted, or a reopen removed, by this write next needs a look; null when it changed neither. */
function passDue(
  before: Doc | undefined,
  after: Doc | undefined,
  serverNow: number
): number | null {
  const was = passesOf(before);
  const granted = Object.entries(passesOf(after))
    .filter(([uid, end]) => end > serverNow && was[uid] !== end)
    .map(([, end]) => end);
  const nowReopened = new Set(reopenedOf(after));
  const unReopened = reopenedOf(before).some((u) => !nowReopened.has(u));
  if (!granted.length && !unReopened) return null;
  return Math.min(
    ...granted,
    ...(unReopened ? [serverNow + TURN_IN_DELAY_MS] : [])
  );
}

/** Keeps an existing marker for the same close, moving it earlier only; otherwise writes one due at `due`. */
function requeueMarker(
  db: Firestore,
  m: MarkerRef,
  due: number,
  serverNow: number
): Promise<void> {
  const ref = db
    .collection(TURN_INS)
    .doc(markerId(m.sessionId, m.classKey, m.kind, m.scope));
  return db.runTransaction(async (tx) => {
    const prev = (await tx.get(ref)).data();
    if (prev?.closedAt === m.closedAt && typeof prev.dueAt === 'number') {
      if (prev.dueAt <= due) return;
      tx.set(ref, { ...prev, dueAt: due });
      return;
    }
    tx.set(ref, {
      ...m,
      serverClosedAt: m.closedAt,
      queuedAt: serverNow,
      attempts: 0,
      dueAt: due,
    });
  });
}

/** A pass granted or a reopen removed on an already-closed class (re)queues its marker for when the pass ends. */
async function queuePassChanges(
  db: Firestore,
  kind: TurnInKind,
  sessionId: string,
  before: Doc | undefined,
  after: Doc | undefined,
  serverNow: number,
  closedNow: Array<[string, number]>
): Promise<void> {
  const due = passDue(before, after, serverNow);
  if (due === null) return;
  const fresh = new Set(closedNow.map(([k]) => k));
  const jobs = Object.entries(rowsOf(after))
    .filter(
      ([key, row]) =>
        !fresh.has(key) &&
        row?.state === 'closed' &&
        typeof row.closedAt === 'number'
    )
    .map(([classKey, row]) =>
      requeueMarker(
        db,
        {
          kind,
          scope: 'class',
          sessionId,
          classKey,
          closedAt: row.closedAt as number,
        },
        due,
        serverNow
      )
    );
  await Promise.all(jobs);
}

/** Whether the run's teacher has the server turn-in preview; memoized so one event checks at most once. */
export type GrantCheck = () => Promise<boolean>;

/** Queues a turn-in for each class this session write closed, any pass change on a closed class, and a run End. */
export async function queueSessionTurnIns(
  db: Firestore,
  kind: TurnInKind,
  sessionId: string,
  before: Doc | undefined,
  after: Doc | undefined,
  serverNow: number,
  granted: GrantCheck = () => Promise.resolve(true)
): Promise<number> {
  const closed = newlyClosed(before, after);
  const ended = newlyEnded(kind, before, after, serverNow);
  const passDiff =
    JSON.stringify(passesOf(before)) !== JSON.stringify(passesOf(after)) ||
    reopenedOf(before).join() !== reopenedOf(after).join();
  // A single-line video run has no class rows; its run marker follows the pass instead.
  if (
    kind === 'videoActivity' &&
    passDiff &&
    Object.keys(rowsOf(after)).length === 0
  )
    await requeueVideoRun(db, sessionId, before, after, serverNow);
  const passChange =
    passDiff &&
    Object.values(rowsOf(after)).some(
      (r) => r?.state === 'closed' && typeof r.closedAt === 'number'
    );
  if (!closed.length && ended === null && !passChange) return 0;
  // A Video Activity class Close shipped before the preview; everything else waits on it.
  if (kind !== 'videoActivity' && !(await granted())) return 0;
  await queuePassChanges(db, kind, sessionId, before, after, serverNow, closed);
  const jobs = closed.map(([classKey, closedAt]) =>
    writeMarker(
      db,
      { kind, scope: 'class', sessionId, classKey, closedAt },
      serverNow
    )
  );
  if (ended !== null) {
    // A Guided Learning close set a little ahead turns in once it arrives.
    const dueAt = Math.max(serverNow, ended) + TURN_IN_DELAY_MS;
    jobs.push(
      writeMarker(
        db,
        { kind, scope: 'run', sessionId, classKey: '', closedAt: ended },
        serverNow,
        // A close set a little ahead is the close time the stamp counts from.
        { dueAt, serverClosedAt: Math.max(serverNow, ended) }
      )
    );
  }
  await Promise.all(jobs);
  return jobs.length;
}

/** Kept for the Video Activity trigger and its tests. */
export function queueClosedClasses(
  db: Firestore,
  sessionId: string,
  before: Doc | undefined,
  after: Doc | undefined,
  serverNow: number
): Promise<number> {
  return queueSessionTurnIns(
    db,
    'videoActivity',
    sessionId,
    before,
    after,
    serverNow
  );
}

/** A single-line Video Activity Close, monitor End or sub End stamps the assignment's closedAt; per-class runs turn in by class. */
export async function queueVideoRunTurnIn(
  db: Firestore,
  sessionId: string,
  before: Doc | undefined,
  after: Doc | undefined,
  serverNow: number
): Promise<boolean> {
  const closedAt = after?.closedAt;
  if (typeof closedAt !== 'number' || closedAt === before?.closedAt)
    return false;
  if (after?.mode === 'view-only') return false;
  const session = (
    await db.collection(SESSIONS.videoActivity).doc(sessionId).get()
  ).data();
  if (!session || session.sessionMode === 'teacher') return false;
  if (Object.keys(rowsOf(session)).length > 0) return false;
  // Like a Video Activity class Close, this backs up the tab's own turn-in with no preview.
  await writeMarker(
    db,
    { kind: 'videoActivity', scope: 'run', sessionId, classKey: '', closedAt },
    serverNow
  );
  return true;
}

/** A Let in on a closed single-line video run moves its run marker to when the pass ends. */
async function requeueVideoRun(
  db: Firestore,
  sessionId: string,
  before: Doc | undefined,
  after: Doc | undefined,
  serverNow: number
): Promise<void> {
  if (!after || after.sessionMode === 'teacher') return;
  const due = passDue(before, after, serverNow);
  const ref = vaAssignmentRef(db, after, sessionId);
  if (due === null || !ref) return;
  const assignment = (await ref.get()).data();
  const closedAt: unknown = assignment?.closedAt;
  if (typeof closedAt !== 'number' || assignment?.mode === 'view-only') return;
  await requeueMarker(
    db,
    { kind: 'videoActivity', scope: 'run', sessionId, classKey: '', closedAt },
    due,
    serverNow
  );
}

function vaAssignmentRef(
  db: Firestore,
  session: Doc,
  sessionId: string
): DocRef | null {
  const teacherUid = session.teacherUid;
  return typeof teacherUid === 'string' && teacherUid
    ? db
        .collection('users')
        .doc(teacherUid)
        .collection(VA_ASSIGNMENTS)
        .doc(sessionId)
    : null;
}

/** Still closed by the same Close or End that queued this marker; a Reopen or a later Close makes it stale. */
function stillClosed(
  m: MarkerRef,
  session: Doc | undefined,
  assignment: Doc | undefined
): boolean {
  if (!session) return false;
  if (m.scope === 'class') {
    const row = rowsOf(session)[m.classKey];
    return row?.state === 'closed' && row.closedAt === m.closedAt;
  }
  if (m.kind === 'quiz')
    return (
      session.status === 'ended' && toMillis(session.endedAt) === m.closedAt
    );
  if (m.kind === 'guidedLearning') return session.closeAt === m.closedAt;
  return assignment?.closedAt === m.closedAt;
}

function inClass(r: Doc, classKey: string, label: string): boolean {
  return typeof r.classId === 'string' && r.classId
    ? r.classId === classKey
    : r.classPeriod === label;
}

function uidOf(r: Doc, docId: string): string {
  return typeof r.studentUid === 'string' && r.studentUid
    ? r.studentUid
    : docId;
}

function unfinished(kind: TurnInKind, r: Doc): boolean {
  return kind === 'quiz'
    ? r.status === 'joined' || r.status === 'in-progress'
    : r.completedAt == null;
}

/** Nothing to turn in: a blank video join, a guided join with no answer to an activity that asks questions, or a scanned row never opened (AB-152). */
function blank(kind: TurnInKind, r: Doc, session: Doc): boolean {
  if (kind === 'quiz')
    return r.status === 'joined' && !!r.paperWrittenBatchId && !r.lastWriteAt;
  const none = !Array.isArray(r.answers) || r.answers.length === 0;
  if (kind === 'videoActivity') return none;
  // A walkthrough with no questions never writes answers, so an empty list says nothing there.
  const steps = session.publicSteps;
  return (
    none &&
    Array.isArray(steps) &&
    steps.some((step) => !!(step as Doc | null)?.question)
  );
}

/** A class Close and a single-line video Close leave let-in students open; an End finishes everyone. */
function honoursPasses(m: MarkerRef): boolean {
  return m.scope === 'class' || m.kind === 'videoActivity';
}

function inScope(m: MarkerRef, session: Doc, r: Doc): boolean {
  if (m.scope === 'run') return true;
  const rawLabel = rowsOf(session)[m.classKey]?.label;
  return inClass(r, m.classKey, typeof rawLabel === 'string' ? rawLabel : '');
}

function picked(
  m: MarkerRef,
  session: Doc,
  r: Doc,
  docId: string,
  now: number
): boolean {
  if (!unfinished(m.kind, r) || !inScope(m, session, r)) return false;
  const isBlank = blank(m.kind, r, session);
  if (!honoursPasses(m)) return !isBlank;
  return !staysOpenAtClose(
    session,
    { ...r, studentUid: uidOf(r, docId) },
    now,
    { blank: isBlank }
  );
}

/** Let in past the close, or reopened: they may have worked after it, so their stamp is the real time. */
function workedPastClose(session: Doc, uid: string, closedAt: number): boolean {
  if (!uid) return false;
  const pass = (session.studentAccess as Doc | undefined)?.[uid];
  return (
    (typeof pass === 'number' && pass > closedAt) ||
    reopenedOf(session).includes(uid)
  );
}

/** When a let-in student's pass ends, if they're left open only because of it. */
function passExpiry(
  session: Doc,
  r: Doc,
  uid: string,
  now: number
): number | null {
  if (r.unlocked === true || !uid) return null;
  if (reopenedOf(session).includes(uid)) return null;
  const pass = (session.studentAccess as Doc | undefined)?.[uid];
  return typeof pass === 'number' && pass > now ? pass : null;
}

async function openResponses(
  kind: TurnInKind,
  sessionRef: DocRef
): Promise<admin.firestore.QueryDocumentSnapshot[]> {
  const responses = sessionRef.collection('responses');
  if (kind === 'quiz')
    return (
      await responses.where('status', 'in', ['joined', 'in-progress']).get()
    ).docs;
  // A guided join may have no completedAt field at all, which an equality query skips.
  if (kind === 'guidedLearning') return (await responses.get()).docs;
  return (await responses.where('completedAt', '==', null).get()).docs;
}

interface QuizMeta {
  questionIds: string[];
  completenessModel: number;
}

async function quizMeta(sessionRef: DocRef, session: Doc): Promise<QuizMeta> {
  const content = await withQuizSessionContent(sessionRef, session);
  return {
    questionIds: sessionQuestionIds(content.publicQuestions),
    completenessModel:
      typeof content.completenessModel === 'number'
        ? content.completenessModel
        : 0,
  };
}

/** The kind's own turn-in write, stamped `stamp`; null when the row is already turned in. */
function turnInPatch(
  kind: TurnInKind,
  r: Doc,
  stamp: number,
  meta: QuizMeta | null
): Doc | null {
  if (kind === 'quiz') {
    const update = meta ? buildQuizFinalizeUpdate(r, meta, stamp) : null;
    return update ? withServerTurnIn(update, stamp) : null;
  }
  if (r.completedAt != null) return null;
  if (kind === 'guidedLearning') return { completedAt: stamp };
  const prior =
    typeof r.completedAttempts === 'number' ? r.completedAttempts : 0;
  return {
    completedAt: stamp,
    completedAttempts: prior + 1,
    turnIn: { at: stamp, claimed: stamp },
  };
}

export type TurnInOutcome = 'stale' | 'done';

/** Turns in one marker's unfinished work, as the teacher's tab would have. */
export async function turnInMarker(
  db: Firestore,
  m: MarkerRef,
  now: number,
  serverClosedAt: number = now
): Promise<{ outcome: TurnInOutcome; turnedIn: number; recheckAt?: number }> {
  const sessionRef = db.collection(SESSIONS[m.kind]).doc(m.sessionId);
  const session = (await sessionRef.get()).data();
  const assignmentRef =
    m.kind === 'videoActivity' && m.scope === 'run' && session
      ? vaAssignmentRef(db, session, m.sessionId)
      : null;
  const assignment = assignmentRef
    ? (await assignmentRef.get()).data()
    : undefined;
  if (!session || !stillClosed(m, session, assignment))
    return { outcome: 'stale', turnedIn: 0 };
  const meta = m.kind === 'quiz' ? await quizMeta(sessionRef, session) : null;
  const docs = (await openResponses(m.kind, sessionRef)).filter((d) =>
    picked(m, session, d.data(), d.id, now)
  );
  // Turned in when the teacher's tab would have done it, so a late sweep doesn't make on-time work Late.
  const at = Math.min(now, serverClosedAt + TURN_IN_DELAY_MS);
  const results = await Promise.allSettled(
    docs.map((d) =>
      db.runTransaction(async (tx) => {
        const parent = (await tx.get(sessionRef)).data();
        const a = assignmentRef
          ? (await tx.get(assignmentRef)).data()
          : undefined;
        if (!parent || !stillClosed(m, parent, a)) return false;
        const fresh = (await tx.get(d.ref)).data();
        if (!fresh || !picked(m, parent, fresh, d.id, now)) return false;
        const stamp =
          honoursPasses(m) &&
          workedPastClose(parent, uidOf(fresh, d.id), m.closedAt)
            ? now
            : at;
        const patch = turnInPatch(m.kind, fresh, stamp, meta);
        if (!patch) return false;
        tx.update(d.ref, patch);
        return true;
      })
    )
  );
  const failed = results.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  );
  if (failed) throw failed.reason;
  const turnedIn = results.filter(
    (r) => r.status === 'fulfilled' && r.value
  ).length;
  if (!honoursPasses(m)) return { outcome: 'done', turnedIn };
  // Re-read so a pass granted during the run is counted; look again when the first one ends.
  const fresh = (await sessionRef.get()).data() ?? session;
  const freshAssignment = assignmentRef
    ? (await assignmentRef.get()).data()
    : undefined;
  let recheckAt: number | undefined;
  if (stillClosed(m, fresh, freshAssignment)) {
    for (const d of await openResponses(m.kind, sessionRef)) {
      const r = d.data();
      if (!unfinished(m.kind, r) || !inScope(m, fresh, r)) continue;
      const end = passExpiry(fresh, r, uidOf(r, d.id), now);
      if (end !== null && (recheckAt === undefined || end < recheckAt))
        recheckAt = end;
    }
  }
  return { outcome: 'done', turnedIn, recheckAt };
}

/** Kept for the Video Activity tests: one closed class's turn-in. */
export function turnInClosedVideoClass(
  db: Firestore,
  sessionId: string,
  classKey: string,
  closedAt: number,
  now: number,
  serverClosedAt: number = now
): ReturnType<typeof turnInMarker> {
  return turnInMarker(
    db,
    { kind: 'videoActivity', scope: 'class', sessionId, classKey, closedAt },
    now,
    serverClosedAt
  );
}

function readMarker(m: Doc): MarkerRef | null {
  const { sessionId, closedAt } = m;
  const kind: TurnInKind =
    m.kind === 'quiz' || m.kind === 'guidedLearning' ? m.kind : 'videoActivity';
  const scope: TurnInScope = m.scope === 'run' ? 'run' : 'class';
  const classKey = typeof m.classKey === 'string' ? m.classKey : '';
  if (typeof sessionId !== 'string' || typeof closedAt !== 'number')
    return null;
  if (scope === 'class' && !classKey) return null;
  return { kind, scope, sessionId, classKey, closedAt };
}

export interface TurnInRunResult {
  markers: number;
  turnedIn: number;
  stale: number;
  failed: number;
  gaveUp: number;
  requeued: number;
}

/** Runs every queued turn-in whose grace has passed, then clears its marker. */
export async function runTurnIns(
  db: Firestore,
  now: number = Date.now()
): Promise<TurnInRunResult> {
  const due = await db
    .collection(TURN_INS)
    .where('dueAt', '<=', now)
    .orderBy('dueAt', 'asc')
    .limit(MAX_MARKERS_PER_RUN)
    .get();
  const result: TurnInRunResult = {
    markers: due.size,
    turnedIn: 0,
    stale: 0,
    failed: 0,
    gaveUp: 0,
    requeued: 0,
  };
  for (const marker of due.docs) {
    const m: Doc = marker.data();
    const ref = readMarker(m);
    // Only the marker as read is cleared; a newer Close rewrites it and keeps its own.
    const clear = () =>
      marker.ref.delete({ lastUpdateTime: marker.updateTime }).catch(() => {});
    if (!ref) {
      await clear();
      continue;
    }
    const serverClosedAt =
      typeof m.serverClosedAt === 'number' ? m.serverClosedAt : ref.closedAt;
    const queuedAt = typeof m.queuedAt === 'number' ? m.queuedAt : ref.closedAt;
    const attempts = typeof m.attempts === 'number' ? m.attempts : 0;
    const log = {
      kind: ref.kind,
      sessionId: ref.sessionId,
      classKey: ref.classKey,
    };
    try {
      const r = await turnInMarker(db, ref, now, serverClosedAt);
      if (r.outcome === 'stale') result.stale++;
      result.turnedIn += r.turnedIn;
      if (r.outcome === 'done' && r.recheckAt !== undefined) {
        result.requeued++;
        await marker.ref
          .update(
            { dueAt: r.recheckAt, attempts: 0, queuedAt: now },
            { lastUpdateTime: marker.updateTime }
          )
          .catch((err) =>
            logger.warn('[turnInQueue] re-queue failed', {
              ...log,
              err: String(err),
            })
          );
      } else await clear();
    } catch (err) {
      result.failed++;
      logger.warn('[turnInQueue] turn-in failed', { ...log, err: String(err) });
      if (now - queuedAt > GIVE_UP_AFTER_MS) {
        result.gaveUp++;
        await clear();
      } else {
        await marker.ref
          .update(
            {
              attempts: attempts + 1,
              dueAt:
                now +
                Math.min(MAX_BACKOFF_MS, RETRY_BACKOFF_MS * (attempts + 1)),
            },
            { lastUpdateTime: marker.updateTime }
          )
          .catch(() => {});
      }
    }
  }
  logger.info('[turnInQueue] run', result);
  return result;
}

/** Kept for the Video Activity tests. */
export const runVideoClassTurnIns = runTurnIns;

/** The teacher's server turn-in preview grant, looked up once per event. */
export function teacherGrant(db: Firestore, teacherUid: unknown): GrantCheck {
  let memo: Promise<boolean> | null = null;
  return () => (memo ??= serverTurnInGranted(db, teacherUid));
}

function sessionTrigger(kind: TurnInKind) {
  return onDocumentUpdated(
    {
      document: `${SESSIONS[kind]}/{sessionId}`,
      region: 'us-central1',
      retry: true,
      ...(kind === 'videoActivity' ? {} : { maxInstances: 10 }),
    },
    async (event) => {
      const db = admin.firestore();
      const after = event.data?.after.data();
      await queueSessionTurnIns(
        db,
        kind,
        event.params.sessionId,
        event.data?.before.data(),
        after,
        Date.parse(event.time) || Date.now(),
        teacherGrant(db, after?.teacherUid)
      );
    }
  );
}

export const queueVideoClassTurnIns = sessionTrigger('videoActivity');
export const queueQuizTurnIns = sessionTrigger('quiz');
export const queueGuidedLearningTurnIns = sessionTrigger('guidedLearning');

export const queueVideoRunTurnIns = onDocumentUpdated(
  {
    document: `users/{teacherUid}/${VA_ASSIGNMENTS}/{assignmentId}`,
    region: 'us-central1',
    retry: true,
  },
  async (event) => {
    const db = admin.firestore();
    await queueVideoRunTurnIn(
      db,
      event.params.assignmentId,
      event.data?.before.data(),
      event.data?.after.data(),
      Date.parse(event.time) || Date.now()
    );
  }
);

export const sweepVideoClassTurnIns = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeoutSeconds: 300,
    memory: '256MiB',
    region: 'us-central1',
  },
  async () => {
    await runTurnIns(admin.firestore());
  }
);
