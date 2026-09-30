// Builds and writes `grade_index` rows from each activity's per-student docs (docs/plans/GRADEBOOK.md D10).
import type * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { withQuizSessionContent } from '../quizSessionContent';
import {
  GRADEBOOK_COLLECTIONS,
  GRADEBOOK_SESSION_COLLECTIONS,
} from '../gradebookCore';
import { servedFibAnswers as servedFibAnswersByLocale } from '../quizScoreOnSubmit';
import {
  assembleRow,
  keyQuestions,
  parseSessionMeta,
  rowId,
  scoreCompletion,
  scoreFlashcardProgress,
  scoreGuidedLearningResponse,
  scoreProjectMember,
  scoreQuizResponse,
  scoreVideoResponse,
  parseStepTargets,
  toMillis,
  type QuizContext,
  isReviewQuiz,
} from './gradeRowMath';
import type {
  IndexAttempt,
  IndexRow,
  GradeKind,
  RowScore,
  SessionMeta,
} from './types';

type Firestore = admin.firestore.Firestore;
type Doc = Record<string, unknown>;

export const GRADE_INDEX = GRADEBOOK_COLLECTIONS.index;
export const GRADE_INDEX_QUEUE = 'grade_index_sessions';
export const GRADE_INDEX_SETTINGS_PATH = 'admin_settings/gradebook_index';

export const SESSION_COLLECTION = GRADEBOOK_SESSION_COLLECTIONS;

/** The per-student subcollection each kind keeps under its session. */
export const STUDENT_SUBCOLLECTION: Record<GradeKind, string> = {
  quiz: 'responses',
  'video-activity': 'responses',
  'guided-learning': 'responses',
  flashcards: 'progress',
  projects: 'grades',
  'mini-app': 'submissions',
  'activity-wall': 'submissions',
};

const asRecord = (v: unknown): Doc =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Doc) : {};
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const asStrings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];

let enabledCache: { value: boolean; at: number } | null = null;
const ENABLED_TTL_MS = 60_000;

/** The org-wide kill switch; the index writes nothing until an admin turns it on. */
export async function isGradeIndexEnabled(
  db: Firestore,
  now = Date.now()
): Promise<boolean> {
  if (enabledCache && now - enabledCache.at < ENABLED_TTL_MS)
    return enabledCache.value;
  const snap = await db.doc(GRADE_INDEX_SETTINGS_PATH).get();
  const value = snap.data()?.enabled === true;
  enabledCache = { value, at: now };
  return value;
}

export function __resetGradeIndexEnabledCache(): void {
  enabledCache = null;
}

/** Everything needed to score any student of one session, loaded once. */
export interface SessionContext {
  kind: GradeKind;
  sessionId: string;
  session: Doc;
  meta: SessionMeta;
  score: (studentUid: string, perStudent: Doc) => RowScore | null;
}

/** A doc key the index can't tie to a stable student (anonymous PIN joins). */
const isPinKey = (docId: string): boolean => docId.startsWith('pin-');

export async function loadSessionContext(
  db: Firestore,
  kind: GradeKind,
  sessionId: string
): Promise<SessionContext | null> {
  const ref = db.collection(SESSION_COLLECTION[kind]).doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  let session = snap.data() ?? {};
  const teacherUid = asString(session.teacherUid);
  if (!teacherUid) return null;

  if (kind === 'quiz') {
    session = await withQuizSessionContent(ref, session);
    const assignmentId = asString(session.assignmentId) || sessionId;
    const assignmentRef = db
      .collection('users')
      .doc(teacherUid)
      .collection('quiz_assignments')
      .doc(assignmentId);
    const [assignmentSnap, keySnap] = await Promise.all([
      assignmentRef.get(),
      assignmentRef.collection('key').doc('answers').get(),
    ]);
    const assignment = assignmentSnap.data() ?? {};
    if (isReviewQuiz(session, assignment)) return null;
    const ctx: QuizContext = {
      questions: keyQuestions(
        keySnap.data()?.questions,
        assignment.questionSnapshot,
        session.publicQuestions
      ),
      fibAnswersByStudent: (uid) => servedFibAnswersByLocale(assignment, uid),
      overrideQuestionIds: (uid) =>
        asStrings(
          asRecord(asRecord(assignment.overridesByStudentUid)[uid]).questionIds
        ),
    };
    const s = session;
    return {
      kind,
      sessionId,
      session: s,
      meta: parseSessionMeta(kind, sessionId, s, assignment),
      score: (_uid, response) => scoreQuizResponse(s, response, ctx),
    };
  }

  if (kind === 'video-activity') {
    const keySnap = await ref.collection('key').doc('answers').get();
    const questions = keyQuestions(
      keySnap.data()?.questions ?? session.questions,
      [],
      session.publicQuestions
    );
    const s = session;
    return {
      kind,
      sessionId,
      session: s,
      meta: parseSessionMeta(kind, sessionId, s),
      score: (_uid, response) => scoreVideoResponse(s, response, questions),
    };
  }

  const s = session;
  const meta = parseSessionMeta(kind, sessionId, s);
  const stepTargets = parseStepTargets(
    kind === 'guided-learning'
      ? (
          await db
            .collection('users')
            .doc(teacherUid)
            .collection('guided_learning_assignments')
            .doc(sessionId)
            .get()
        ).data()?.stepTargets
      : undefined
  );
  const scorers: Record<
    Exclude<GradeKind, 'quiz' | 'video-activity'>,
    SessionContext['score']
  > = {
    'guided-learning': (_uid, response) =>
      scoreGuidedLearningResponse(s, response, stepTargets),
    // Study sets are not a column (D6); only check mode is scored.
    flashcards: (_uid, progress) =>
      s.kind === 'check' ? scoreFlashcardProgress(s, progress) : null,
    // Project rows are built from the group grade in `projectRows`.
    projects: () => null,
    'mini-app': (_uid, submission) =>
      scoreCompletion(
        toMillis(submission.submittedAt),
        meta.classIds.length === 1 ? meta.classIds[0] : null
      ),
    'activity-wall': (_uid, submission) =>
      scoreCompletion(
        toMillis(submission.submittedAt),
        meta.classIds.length === 1 ? meta.classIds[0] : null
      ),
  };
  return { kind, sessionId, session: s, meta, score: scorers[kind] };
}

/** The student a per-student doc belongs to; null for work the gradebook can't match. */
export function studentUidFor(
  kind: GradeKind,
  docId: string,
  data: Doc
): string | null {
  switch (kind) {
    case 'quiz':
    case 'video-activity':
      return isPinKey(docId) ? null : asString(data.studentUid) || null;
    case 'guided-learning':
      return asString(data.pin) ? null : docId;
    case 'flashcards':
      return docId;
    case 'mini-app':
      return asString(data.studentUid) || null;
    case 'activity-wall':
      return data.isGuest === true ? null : asString(data.authorUid) || null;
    case 'projects':
      return null;
  }
}

interface TargetingInfo {
  assigned: boolean;
  pointerDueAt: number | null;
}

/** D25: with individual targeting, only students holding a live pointer are assigned. */
async function targetingFor(
  db: Firestore,
  meta: SessionMeta,
  studentUid: string
): Promise<TargetingInfo> {
  if (!meta.individualTargeting) return { assigned: true, pointerDueAt: null };
  const pointer = await db
    .collection('student_assignments')
    .doc(studentUid)
    .collection('items')
    .doc(meta.assignmentId)
    .get();
  const data = pointer.data();
  if (!pointer.exists || !data || data.excluded === true)
    return { assigned: false, pointerDueAt: null };
  return { assigned: true, pointerDueAt: toMillis(data.dueAt) };
}

async function buildRow(
  db: Firestore,
  ctx: SessionContext,
  studentUid: string,
  score: RowScore,
  previous: Doc | undefined,
  now: number
): Promise<IndexRow> {
  const targeting = await targetingFor(db, ctx.meta, studentUid);
  return assembleRow({
    meta: ctx.meta,
    studentUid,
    score,
    previousAttempts: previousAttemptsOf(previous),
    previousCreatedAt:
      typeof previous?.createdAt === 'number' ? previous.createdAt : null,
    assigned: targeting.assigned,
    pointerDueAt: targeting.pointerDueAt,
    now,
  });
}

function previousAttemptsOf(data: Doc | undefined): IndexAttempt[] {
  const raw = data?.attempts;
  return Array.isArray(raw) ? (raw as IndexAttempt[]) : [];
}

function sameRow(row: IndexRow, previous: Doc | undefined): boolean {
  if (!previous) return false;
  const { updatedAt: _a, ...next } = row as unknown as Doc;
  const { updatedAt: _b, ...prev } = previous;
  void _a;
  void _b;
  return stableStringify(next) === stableStringify(prev);
}

/** Write only when something besides `updatedAt` changed, so reruns cost no writes. */
async function writeRow(
  db: Firestore,
  row: IndexRow,
  previous: Doc | undefined
): Promise<boolean> {
  if (sameRow(row, previous)) return false;
  await db
    .collection(GRADE_INDEX)
    .doc(rowId(row.sessionId, row.studentUid))
    .set(row as unknown as Doc);
  return true;
}

/** Recompute write: a row a trigger rewrote after `startedAt` is newer than this snapshot, so it stays. */
async function writeRowIfNotNewer(
  db: Firestore,
  row: IndexRow,
  startedAt: number
): Promise<boolean> {
  const ref = db
    .collection(GRADE_INDEX)
    .doc(rowId(row.sessionId, row.studentUid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data();
    if (sameRow(row, current)) return false;
    if (typeof current?.updatedAt === 'number' && current.updatedAt > startedAt)
      return false;
    tx.set(ref, row as unknown as Doc);
    return true;
  });
}

/** The per-student doc as it is now, so a late or repeated event can't write stale data. */
async function freshStudentDoc(
  db: Firestore,
  w: DocWrite
): Promise<Doc | undefined> {
  const snap = await db
    .collection(SESSION_COLLECTION[w.kind])
    .doc(w.sessionId)
    .collection(STUDENT_SUBCOLLECTION[w.kind])
    .doc(w.docId)
    .get();
  return snap.exists ? (snap.data() ?? undefined) : undefined;
}

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Doc)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stableStringify(x)}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

async function deleteRow(
  db: Firestore,
  sessionId: string,
  studentUid: string
): Promise<void> {
  await db.collection(GRADE_INDEX).doc(rowId(sessionId, studentUid)).delete();
}

/** Activity Wall: one row per author from their earliest submission. */
async function wallSubmittedAt(
  db: Firestore,
  sessionId: string,
  authorUid: string
): Promise<number | null> {
  const snap = await db
    .collection(SESSION_COLLECTION['activity-wall'])
    .doc(sessionId)
    .collection('submissions')
    .where('authorUid', '==', authorUid)
    .get();
  const times = snap.docs
    .map((d) => toMillis(d.data().submittedAt))
    .filter((t): t is number => t !== null);
  if (snap.docs.length === 0) return null;
  return times.length > 0 ? Math.min(...times) : 0;
}

/** Rows for every member of one project group; the group doc supplies the members. */
async function projectRows(
  db: Firestore,
  ctx: SessionContext,
  groupId: string,
  grade: Doc | undefined,
  now: number,
  prevOf: (uid: string) => Promise<Doc | undefined>
): Promise<{ upserts: IndexRow[]; memberUids: string[] }> {
  const groupSnap = await db
    .collection(SESSION_COLLECTION.projects)
    .doc(ctx.sessionId)
    .collection('groups')
    .doc(groupId)
    .get();
  const group = groupSnap.data() ?? {};
  const memberUids = asStrings(group.memberUids);
  if (!grade) return { upserts: [], memberUids };
  const upserts: IndexRow[] = [];
  for (const uid of memberUids) {
    upserts.push(
      await buildRow(
        db,
        ctx,
        uid,
        scoreProjectMember(grade, group, uid),
        await prevOf(uid),
        now
      )
    );
  }
  return { upserts, memberUids };
}

export interface DocWrite {
  kind: GradeKind;
  sessionId: string;
  docId: string;
  before: Doc | undefined;
  after: Doc | undefined;
}

/** Fields whose change can move a row; mid-attempt answer saves are skipped. */
const WATCHED: Record<GradeKind, string[]> = {
  quiz: [
    'status',
    'score',
    'grading',
    'resultsOverride',
    'completedAttempts',
    'submittedAt',
    'classId',
    'servedQuestionIds',
  ],
  'video-activity': [
    'score',
    'completedAt',
    'completedAttempts',
    'resultsOverride',
    'classId',
  ],
  'guided-learning': ['score', 'completedAt', 'resultsOverride', 'classId'],
  flashcards: ['score', 'total', 'submittedAt', 'classId'],
  projects: ['points', 'maxPoints', 'overridesByUid', 'released', 'gradedAt'],
  'mini-app': ['submittedAt', 'studentUid'],
  'activity-wall': ['submittedAt', 'authorUid'],
};

export function docWriteMatters(w: DocWrite): boolean {
  if (!w.before || !w.after) return true;
  const b = w.before;
  const a = w.after;
  if (
    WATCHED[w.kind].some((f) => stableStringify(b[f]) !== stableStringify(a[f]))
  )
    return true;
  // A completed quiz or video attempt can be regraded answer by answer.
  const done =
    w.kind === 'quiz'
      ? a.status === 'completed'
      : w.kind === 'video-activity'
        ? a.completedAt != null
        : false;
  return done && stableStringify(b.answers) !== stableStringify(a.answers);
}

/** Upserts or deletes the rows one per-student doc write affects. */
export async function applyDocWrite(
  db: Firestore,
  w: DocWrite,
  now = Date.now()
): Promise<number> {
  if (!docWriteMatters(w)) return 0;
  const ctx = await loadSessionContext(db, w.kind, w.sessionId);
  if (!ctx) return 0;
  let writes = 0;
  const after = await freshStudentDoc(db, w);
  w = { ...w, after };

  if (w.kind === 'projects') {
    const { upserts, memberUids } = await projectRows(
      db,
      ctx,
      w.docId,
      w.after,
      now,
      async (uid) =>
        (
          await db.collection(GRADE_INDEX).doc(rowId(w.sessionId, uid)).get()
        ).data()
    );
    if (!w.after) {
      for (const uid of memberUids) await deleteRow(db, w.sessionId, uid);
      return memberUids.length;
    }
    for (const row of upserts) {
      const prev = await db
        .collection(GRADE_INDEX)
        .doc(rowId(row.sessionId, row.studentUid))
        .get();
      if (await writeRow(db, row, prev.data())) writes++;
    }
    return writes;
  }

  const data = w.after ?? w.before ?? {};
  const studentUid = studentUidFor(w.kind, w.docId, data);
  if (!studentUid) return 0;
  const beforeUid = w.before ? studentUidFor(w.kind, w.docId, w.before) : null;
  if (beforeUid && beforeUid !== studentUid)
    await deleteRow(db, w.sessionId, beforeUid);

  let score: RowScore | null;
  if (w.kind === 'activity-wall') {
    const at = await wallSubmittedAt(db, w.sessionId, studentUid);
    score = at === null ? null : ctx.score(studentUid, { submittedAt: at });
  } else {
    score = w.after ? ctx.score(studentUid, w.after) : null;
  }
  if (!score) {
    await deleteRow(db, w.sessionId, studentUid);
    return 1;
  }
  const prevSnap = await db
    .collection(GRADE_INDEX)
    .doc(rowId(w.sessionId, studentUid))
    .get();
  const prev = prevSnap.data();
  const row = await buildRow(db, ctx, studentUid, score, prev, now);
  return (await writeRow(db, row, prev)) ? 1 : 0;
}

/** Rebuilds every row of one session; rows whose work is gone are deleted. */
export async function recomputeSession(
  db: Firestore,
  kind: GradeKind,
  sessionId: string,
  now = Date.now()
): Promise<{ written: number; deleted: number }> {
  const existingSnap = await db
    .collection(GRADE_INDEX)
    .where('sessionId', '==', sessionId)
    .get();
  const existing = new Map(existingSnap.docs.map((d) => [d.id, d.data()]));
  const startedAt = now;
  const ctx = await loadSessionContext(db, kind, sessionId);
  const keep = new Set<string>();
  let written = 0;

  if (ctx) {
    const docs = await db
      .collection(SESSION_COLLECTION[kind])
      .doc(sessionId)
      .collection(STUDENT_SUBCOLLECTION[kind])
      .get();
    const rows: IndexRow[] = [];
    if (kind === 'projects') {
      for (const d of docs.docs) {
        const { upserts } = await projectRows(
          db,
          ctx,
          d.id,
          d.data(),
          now,
          (uid) => Promise.resolve(existing.get(rowId(sessionId, uid)))
        );
        rows.push(...upserts);
      }
    } else {
      const wallFirst = new Map<string, number>();
      for (const d of docs.docs) {
        const data = d.data();
        const uid = studentUidFor(kind, d.id, data);
        if (!uid) continue;
        if (kind === 'activity-wall') {
          const at = toMillis(data.submittedAt) ?? 0;
          wallFirst.set(uid, Math.min(wallFirst.get(uid) ?? at, at));
          continue;
        }
        const score = ctx.score(uid, data);
        if (!score) continue;
        const prev = existing.get(rowId(sessionId, uid));
        rows.push(await buildRow(db, ctx, uid, score, prev, now));
      }
      for (const [uid, at] of wallFirst) {
        const score = ctx.score(uid, { submittedAt: at });
        if (score)
          rows.push(
            await buildRow(
              db,
              ctx,
              uid,
              score,
              existing.get(rowId(sessionId, uid)),
              now
            )
          );
      }
    }
    for (const row of rows) {
      const id = rowId(row.sessionId, row.studentUid);
      keep.add(id);
      if (sameRow(row, existing.get(id))) continue;
      if (await writeRowIfNotNewer(db, row, startedAt)) written++;
    }
  }

  let deleted = 0;
  for (const id of existing.keys()) {
    if (keep.has(id)) continue;
    await db.collection(GRADE_INDEX).doc(id).delete();
    deleted++;
  }
  return { written, deleted };
}

/** Session fields whose change reshapes every row (D10 whole-session recompute). */
const SESSION_WATCHED = [
  'teacherUid',
  'title',
  'quizTitle',
  'assignmentName',
  'activityTitle',
  'appTitle',
  'prompt',
  'rosterIds',
  'classIds',
  'classId',
  'periodAccess',
  'openAt',
  'dueAt',
  'closeAt',
  'dueAtByClassId',
  'individualTargeting',
  'scorePublishedAt',
  'scoreVisibility',
  'publicSteps',
  'publicQuestions',
  'questionsInContent',
  'sections',
  'kind',
  'assignmentId',
];

export function sessionWriteMatters(
  before: Doc | undefined,
  after: Doc | undefined
): boolean {
  if (!before || !after) return true;
  return SESSION_WATCHED.some(
    (f) => stableStringify(before[f]) !== stableStringify(after[f])
  );
}

/** Queues a whole-session recompute; the scheduled worker drains it oldest first. */
export async function markSessionDirty(
  db: Firestore,
  kind: GradeKind,
  sessionId: string,
  now = Date.now()
): Promise<void> {
  await db
    .collection(GRADE_INDEX_QUEUE)
    .doc(sessionId)
    .set({ kind, sessionId, dirtyAt: now });
}

export const RECOMPUTE_LIMIT = 200;
/** Stops taking new sessions well before the 540 s timeout; the rest wait for the next run. */
export const RECOMPUTE_BUDGET_MS = 420_000;

/** Drains the dirty queue; a session re-dirtied mid-run stays queued. */
const MAX_RECOMPUTE_FAILURES = 5;

export async function drainDirtySessions(
  db: Firestore,
  limit = RECOMPUTE_LIMIT
): Promise<{ recomputed: number; failed: number }> {
  const snap = await db
    .collection(GRADE_INDEX_QUEUE)
    .orderBy('dirtyAt', 'asc')
    .limit(limit)
    .get();
  let recomputed = 0;
  let failed = 0;
  const started = Date.now();
  for (const doc of snap.docs) {
    if (Date.now() - started > RECOMPUTE_BUDGET_MS) break;
    const data = doc.data();
    const kind = data.kind as GradeKind;
    if (!(kind in SESSION_COLLECTION)) {
      await doc.ref.delete();
      continue;
    }
    try {
      await recomputeSession(db, kind, doc.id);
      recomputed++;
      await db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        if (current.exists && current.data()?.dirtyAt === data.dirtyAt)
          tx.delete(doc.ref);
      });
    } catch (err) {
      failed++;
      const failures = (Number(data.failures) || 0) + 1;
      logger.error('gradeIndex: session recompute failed', {
        sessionId: doc.id,
        kind,
        failures,
        error: err instanceof Error ? err.message : String(err),
      });
      // Move it behind newer work; give up after MAX_RECOMPUTE_FAILURES tries.
      await db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        if (!current.exists || current.data()?.dirtyAt !== data.dirtyAt) return;
        if (failures >= MAX_RECOMPUTE_FAILURES) tx.delete(doc.ref);
        else tx.update(doc.ref, { dirtyAt: Date.now(), failures });
      });
    }
  }
  return { recomputed, failed };
}
