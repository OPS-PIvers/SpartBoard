// Writing assignment status changes (docs/plans/WRITING_ASSIGNMENT.md §4.2): every one runs here, never in a client write.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { assertViewAsAllowed } from './viewAsGuard';
import {
  WRITING_CLOSE_GRACE_MS,
  WRITING_TIMED_FLUSH_GRACE_MS,
  canSaveFeedback,
  countWritingWords,
  deriveWritingStatus,
  resolveWritingDueAt,
  takeBackBlock,
  timedTurnInDue,
  turnInBlock,
  writingDeadline,
  writingEventAllowed,
  writingTransition,
  type WritingEvent,
  type WritingResponseStatus,
  type WritingTurnedInBy,
} from './writingResponseState';

export const WRITING_SESSIONS = 'writing_assignment_sessions';
export const WRITING_RESPONSES = 'responses';
export const WRITING_DRAFTS = 'drafts';
export const WRITING_LOG = 'log';

/** Who is calling: a ClassLink student (or test class) or a teacher. */
export interface WritingCaller {
  uid: string;
  /** studentLoginV1 token; PIN sign-ins are left out (D20). */
  student: boolean;
  classIds: string[];
}

type Data = Record<string, unknown>;

const HTML_MAX = 400_000;
const TAB_ID_MAX = 100;
const COMMENT_MAX = 10_000;
const ANNOTATIONS_MAX = 300;
const RUBRIC_SCORES_MAX = 50;

const isDocumentId = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 1500 &&
  !v.includes('/') &&
  v !== '.' &&
  v !== '..' &&
  !/^__.*__$/.test(v);

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function requireCaller(caller: WritingCaller | null): WritingCaller {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  return caller;
}

function requireStudent(caller: WritingCaller | null): WritingCaller {
  const c = requireCaller(caller);
  if (!c.student)
    throw new HttpsError('permission-denied', 'Student sign-in required.');
  return c;
}

function sessionIdOf(data: unknown): string {
  const id = (data as Data | null)?.sessionId;
  if (!isDocumentId(id))
    throw new HttpsError('invalid-argument', 'sessionId is required.');
  return id;
}

function tabIdOf(data: unknown): string {
  const id = (data as Data | null)?.tabId;
  if (typeof id !== 'string' || id.length === 0 || id.length > TAB_ID_MAX)
    throw new HttpsError('invalid-argument', 'tabId is required.');
  return id;
}

const sessionRef = (db: Firestore, sid: string) =>
  db.collection(WRITING_SESSIONS).doc(sid);
const responseRef = (db: Firestore, sid: string, uid: string) =>
  sessionRef(db, sid).collection(WRITING_RESPONSES).doc(uid);
const draftRef = (response: DocumentReference, n: number) =>
  response.collection(WRITING_DRAFTS).doc(String(n));
const pointerRef = (db: Firestore, uid: string, sid: string) =>
  db.collection('student_assignments').doc(uid).collection('items').doc(sid);

function sessionClassIds(session: Data): string[] {
  const ids = Array.isArray(session.classIds)
    ? session.classIds.filter((c): c is string => typeof c === 'string')
    : [];
  if (typeof session.classId === 'string' && !ids.includes(session.classId))
    ids.push(session.classId);
  return ids;
}

const windowField = (
  pointer: Data,
  session: Data,
  field: 'openAt' | 'closeAt' | 'dueAt'
): number | null =>
  isNum(pointer[field])
    ? pointer[field]
    : isNum(session[field])
      ? session[field]
      : null;

const emptySummary = (now: number) => ({
  wordCount: 0,
  savedAt: now,
  writingMs: 0,
  sessions: 0,
  pasteCount: 0,
  pastedChars: 0,
  untypedCount: 0,
  untypedChars: 0,
  awayMs: 0,
  awayCount: 0,
});

/** The student's own flush: final text and summary from the holding tab (D24), refused when stale. */
interface Flush {
  html: string;
  summary: Data;
  saveCount: number;
}

function flushOf(data: unknown): Flush | null {
  const d = (data ?? {}) as Data;
  if (d.html === undefined) return null;
  if (typeof d.html !== 'string' || d.html.length > HTML_MAX)
    throw new HttpsError('invalid-argument', 'html is too long.');
  if (!isNum(d.saveCount))
    throw new HttpsError('invalid-argument', 'saveCount is required.');
  const summary =
    typeof d.summary === 'object' && d.summary !== null
      ? (d.summary as Data)
      : {};
  return { html: d.html, summary, saveCount: d.saveCount };
}

/** D23/D24: a flush must come from the holding tab and raise the save counter. */
function assertFresh(response: Data, tabId: string, flush: Flush | null): void {
  if (response.tabId !== tabId)
    throw new HttpsError(
      'failed-precondition',
      'This piece is open in another tab.',
      { reason: 'stale-tab' }
    );
  if (flush && !(isNum(response.saveCount) && flush.saveCount > response.saveCount))
    throw new HttpsError('failed-precondition', 'A newer save exists.', {
      reason: 'stale-save',
    });
}

async function loadStudentAccess(
  db: Firestore,
  caller: WritingCaller,
  sid: string
): Promise<{ session: Data; pointer: Data; classId: string }> {
  const [sessionSnap, pointerSnap] = await Promise.all([
    sessionRef(db, sid).get(),
    pointerRef(db, caller.uid, sid).get(),
  ]);
  if (!sessionSnap.exists)
    throw new HttpsError('not-found', 'Assignment not found.');
  const session: Data = sessionSnap.data() ?? {};
  const pointer: Data = pointerSnap.exists ? (pointerSnap.data() ?? {}) : {};
  if (pointer.excluded === true)
    throw new HttpsError('permission-denied', 'Not assigned to this student.');
  const shared = caller.classIds.find((c) =>
    sessionClassIds(session).includes(c)
  );
  const classId =
    shared ?? (typeof pointer.classId === 'string' ? pointer.classId : '');
  if (!pointerSnap.exists && shared === undefined)
    throw new HttpsError('permission-denied', 'Not assigned to this student.');
  return { session, pointer, classId };
}

function freezeDraft(
  tx: Transaction,
  ref: DocumentReference,
  response: Data,
  html: string,
  summary: Data,
  logLength: number,
  by: WritingTurnedInBy,
  now: number
): void {
  const number = (isNum(response.draftCount) ? response.draftCount : 0) + 1;
  tx.set(draftRef(ref, number), {
    number,
    html,
    summary,
    turnedInAt: now,
    turnedInBy: by,
    logMark: {
      chunk: isNum(response.logChunk) ? response.logChunk : 0,
      length: logLength,
    },
  });
  tx.update(ref, {
    status: writingTransition(deriveWritingStatus(response), {
      type: 'turn-in',
    }),
    draftCount: number,
    latestDraftId: String(number),
    turnedInAt: now,
    turnedInBy: by,
    updatedAt: now,
  });
}

async function openLogLength(
  tx: Transaction,
  ref: DocumentReference,
  response: Data
): Promise<number> {
  const chunk = isNum(response.logChunk) ? response.logChunk : 0;
  const snap = await tx.get(ref.collection(WRITING_LOG).doc(String(chunk)));
  const log: unknown = snap.exists ? snap.get('log') : '';
  return typeof log === 'string' ? log.length : 0;
}

// ── openWritingV1 ────────────────────────────────────────────────────────────

export interface OpenWritingResult {
  created: boolean;
  status: WritingResponseStatus;
  saveCount: number;
  deadlineAt: number | null;
}

/** Creates the student's response on first open (the clock starts here, D7) or returns the existing one. */
export async function handleOpenWriting(
  db: Firestore,
  rawCaller: WritingCaller | null,
  data: unknown,
  now: number
): Promise<OpenWritingResult> {
  const caller = requireStudent(rawCaller);
  const sid = sessionIdOf(data);
  const tabId = tabIdOf(data);
  const { session, pointer, classId } = await loadStudentAccess(
    db,
    caller,
    sid
  );
  const ref = responseRef(db, sid, caller.uid);
  return db.runTransaction(async (tx): Promise<OpenWritingResult> => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const r: Data = snap.data() ?? {};
      return {
        created: false,
        status: deriveWritingStatus(r),
        saveCount: isNum(r.saveCount) ? r.saveCount : 0,
        deadlineAt: isNum(r.deadlineAt) ? r.deadlineAt : null,
      };
    }
    if (session.status === 'ended')
      throw new HttpsError('failed-precondition', 'This assignment has ended.');
    const openAt = windowField(pointer, session, 'openAt');
    const closeAt = windowField(pointer, session, 'closeAt');
    if (openAt !== null && now < openAt - WRITING_CLOSE_GRACE_MS)
      throw new HttpsError('failed-precondition', 'Not open yet.');
    if (closeAt !== null && now > closeAt + WRITING_CLOSE_GRACE_MS)
      throw new HttpsError('failed-precondition', 'This assignment is closed.');
    const override = (pointer.override ?? {}) as Data;
    const deadlineAt = writingDeadline(
      now,
      session.timeLimitMinutes,
      override.timeMultiplier
    );
    tx.create(ref, {
      studentUid: caller.uid,
      classId,
      html: '',
      summary: emptySummary(now),
      status: 'draft',
      saveCount: 0,
      tabId,
      tabAt: FieldValue.serverTimestamp(),
      logChunk: 0,
      startedAt: now,
      ...(isNum(session.timeLimitMinutes) && session.timeLimitMinutes > 0
        ? { timerStartedAt: now }
        : {}),
      ...(deadlineAt !== null ? { deadlineAt } : {}),
      draftCount: 0,
      updatedAt: now,
    });
    return { created: true, status: 'draft', saveCount: 0, deadlineAt };
  });
}

// ── turnInWritingV1 ──────────────────────────────────────────────────────────

export interface WritingStatusResult {
  status: WritingResponseStatus;
  draftCount: number;
}

/** The student turns the piece in from the holding tab, with an optional final flush. */
export async function handleTurnInWriting(
  db: Firestore,
  rawCaller: WritingCaller | null,
  data: unknown,
  now: number
): Promise<WritingStatusResult> {
  const caller = requireStudent(rawCaller);
  const sid = sessionIdOf(data);
  const tabId = tabIdOf(data);
  const flush = flushOf(data);
  const { session, pointer } = await loadStudentAccess(db, caller, sid);
  const ref = responseRef(db, sid, caller.uid);
  return db.runTransaction(async (tx): Promise<WritingStatusResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists)
      throw new HttpsError('not-found', 'Open the assignment first.');
    const r: Data = snap.data() ?? {};
    const status = deriveWritingStatus(r);
    assertFresh(r, tabId, flush);
    const html = flush ? flush.html : typeof r.html === 'string' ? r.html : '';
    const block = turnInBlock(status, {
      now,
      closeAt: windowField(pointer, session, 'closeAt'),
      wordCount: countWritingWords(html),
      minWords: isNum(session.minWords) ? session.minWords : undefined,
      maxWords: isNum(session.maxWords) ? session.maxWords : undefined,
      enforceWordLimit: session.enforceWordLimit === true,
    });
    if (block)
      throw new HttpsError('failed-precondition', 'Cannot turn this in.', {
        reason: block,
      });
    const logLength = await openLogLength(tx, ref, r);
    const summary = {
      ...((r.summary ?? {}) as Data),
      ...(flush?.summary ?? {}),
      wordCount: countWritingWords(html),
    };
    if (flush)
      tx.update(ref, { html, summary, saveCount: flush.saveCount });
    freezeDraft(tx, ref, r, html, summary, logLength, 'student', now);
    const draftCount = (isNum(r.draftCount) ? r.draftCount : 0) + 1;
    return { status: 'turned-in', draftCount };
  });
}

// ── takeBackWritingV1 ────────────────────────────────────────────────────────

/** D12: discards the latest frozen copy if no feedback is on it, in one transaction with the check. */
export async function handleTakeBackWriting(
  db: Firestore,
  rawCaller: WritingCaller | null,
  data: unknown,
  now: number
): Promise<WritingStatusResult> {
  const caller = requireStudent(rawCaller);
  const sid = sessionIdOf(data);
  const { session, pointer } = await loadStudentAccess(db, caller, sid);
  const ref = responseRef(db, sid, caller.uid);
  return db.runTransaction(async (tx): Promise<WritingStatusResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Nothing to take back.');
    const r: Data = snap.data() ?? {};
    const count = isNum(r.draftCount) ? r.draftCount : 0;
    const latest = count > 0 ? draftRef(ref, count) : null;
    const draftSnap = latest ? await tx.get(latest) : null;
    const draft: Data = draftSnap?.exists ? (draftSnap.data() ?? {}) : {};
    const facts = {
      now,
      dueAt: resolveWritingDueAt(
        session,
        typeof r.classId === 'string' ? r.classId : null,
        pointer.dueAt
      ),
      hasFeedback: draft.feedback != null || isNum(draft.feedbackAt),
      timed: isNum(session.timeLimitMinutes) && session.timeLimitMinutes > 0,
    };
    const status = deriveWritingStatus(r);
    const block = !draftSnap?.exists
      ? 'not-turned-in'
      : takeBackBlock(status, facts);
    if (block || !latest)
      throw new HttpsError('failed-precondition', 'Cannot take this back.', {
        reason: block,
      });
    const event: WritingEvent = {
      type: 'take-back',
      facts,
      draftsLeft: count - 1,
    };
    tx.delete(latest);
    tx.update(ref, {
      status: writingTransition(status, event),
      draftCount: count - 1,
      latestDraftId:
        count - 1 > 0 ? String(count - 1) : FieldValue.delete(),
      turnedInAt: FieldValue.delete(),
      turnedInBy: FieldValue.delete(),
      updatedAt: now,
    });
    return { status: writingTransition(status, event), draftCount: count - 1 };
  });
}

// ── turnInTimedWritingV1 ─────────────────────────────────────────────────────

async function sessionForTeacher(
  db: Firestore,
  caller: WritingCaller,
  sid: string
): Promise<Data> {
  if (caller.student)
    throw new HttpsError('permission-denied', 'Teacher sign-in required.');
  const snap = await sessionRef(db, sid).get();
  const session: Data = snap.exists ? (snap.data() ?? {}) : {};
  if (!snap.exists || session.teacherUid !== caller.uid)
    throw new HttpsError('permission-denied', 'Not your assignment.');
  return session;
}

/** D7: once the clock runs out, the holding tab or the teacher turns the piece in; the server checks the clock. */
export async function handleTimedTurnIn(
  db: Firestore,
  rawCaller: WritingCaller | null,
  data: unknown,
  now: number
): Promise<WritingStatusResult> {
  const caller = requireCaller(rawCaller);
  const sid = sessionIdOf(data);
  const d = (data ?? {}) as Data;
  let studentUid: string;
  let flush: Flush | null = null;
  let tabId: string | null = null;
  if (caller.student) {
    await loadStudentAccess(db, caller, sid);
    studentUid = caller.uid;
    flush = flushOf(data);
    if (flush) tabId = tabIdOf(data);
  } else {
    await sessionForTeacher(db, caller, sid);
    if (!isDocumentId(d.studentUid))
      throw new HttpsError('invalid-argument', 'studentUid is required.');
    studentUid = d.studentUid;
  }
  const ref = responseRef(db, sid, studentUid);
  return db.runTransaction(async (tx): Promise<WritingStatusResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No response.');
    const r: Data = snap.data() ?? {};
    const status = deriveWritingStatus(r);
    const count = isNum(r.draftCount) ? r.draftCount : 0;
    if (status === 'turned-in' || status === 'returned')
      return { status, draftCount: count };
    if (!isNum(r.deadlineAt))
      throw new HttpsError('failed-precondition', 'This piece is not timed.');
    if (!timedTurnInDue(now, r.deadlineAt))
      throw new HttpsError('failed-precondition', 'Time is not up yet.', {
        reason: 'early',
      });
    // F decides how late a flush may land (§5); past the grace the saved text is frozen as it is.
    const useFlush =
      flush !== null &&
      tabId !== null &&
      now <= r.deadlineAt + WRITING_TIMED_FLUSH_GRACE_MS;
    if (useFlush && tabId) assertFresh(r, tabId, flush);
    const html =
      useFlush && flush
        ? flush.html
        : typeof r.html === 'string'
          ? r.html
          : '';
    const logLength = await openLogLength(tx, ref, r);
    const summary = {
      ...((r.summary ?? {}) as Data),
      ...(useFlush && flush ? flush.summary : {}),
      wordCount: countWritingWords(html),
    };
    if (useFlush && flush)
      tx.update(ref, { html, summary, saveCount: flush.saveCount });
    freezeDraft(tx, ref, r, html, summary, logLength, 'timer', now);
    return { status: 'turned-in', draftCount: count + 1 };
  });
}

// ── returnWritingV1 / returnWritingForRevisionV1 ────────────────────────────

/** Return (keeps it locked) or Return for revision (unlocks it); either repeats, and D11 can change with it. */
export async function handleReturnWriting(
  db: Firestore,
  rawCaller: WritingCaller | null,
  data: unknown,
  now: number,
  revise: boolean
): Promise<WritingStatusResult> {
  const caller = requireCaller(rawCaller);
  const sid = sessionIdOf(data);
  const d = (data ?? {}) as Data;
  if (!isDocumentId(d.studentUid))
    throw new HttpsError('invalid-argument', 'studentUid is required.');
  await sessionForTeacher(db, caller, sid);
  const ref = responseRef(db, sid, d.studentUid);
  const event: WritingEvent = {
    type: revise ? 'return-for-revision' : 'return',
  };
  return db.runTransaction(async (tx): Promise<WritingStatusResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No response.');
    const r: Data = snap.data() ?? {};
    const status = deriveWritingStatus(r);
    const count = isNum(r.draftCount) ? r.draftCount : 0;
    const latest = count > 0 ? draftRef(ref, count) : null;
    const draftSnap = latest ? await tx.get(latest) : null;
    if (!latest || !draftSnap?.exists || !writingEventAllowed(status, event))
      throw new HttpsError('failed-precondition', 'Nothing to return.', {
        reason: draftSnap?.exists === false ? 'taken-back' : 'not-turned-in',
      });
    const next = writingTransition(status, event);
    tx.update(latest, {
      returnedAt: now,
      returnKind: revise ? 'revision' : 'return',
    });
    tx.update(ref, { status: next, returnedAt: now, updatedAt: now });
    if (typeof d.studentCanViewRecord === 'boolean')
      tx.update(sessionRef(db, sid), {
        studentCanViewRecord: d.studentCanViewRecord,
        updatedAt: now,
      });
    return { status: next, draftCount: count };
  });
}

// ── saveWritingFeedbackV1 ────────────────────────────────────────────────────

function sanitizeFeedback(raw: unknown, caller: WritingCaller, now: number) {
  if (typeof raw !== 'object' || raw === null)
    throw new HttpsError('invalid-argument', 'feedback is required.');
  const f = raw as Data;
  const out: Data = { gradedBy: caller.uid, gradedAt: now };
  if (f.pointsAwarded !== undefined) {
    if (!isNum(f.pointsAwarded) || f.pointsAwarded < 0)
      throw new HttpsError('invalid-argument', 'pointsAwarded is invalid.');
    out.pointsAwarded = f.pointsAwarded;
  }
  if (f.overallComment !== undefined) {
    if (
      typeof f.overallComment !== 'string' ||
      f.overallComment.length > COMMENT_MAX
    )
      throw new HttpsError('invalid-argument', 'overallComment is invalid.');
    out.overallComment = f.overallComment;
  }
  if (f.annotations !== undefined) {
    if (
      !Array.isArray(f.annotations) ||
      f.annotations.length > ANNOTATIONS_MAX
    )
      throw new HttpsError('invalid-argument', 'annotations are invalid.');
    out.annotations = f.annotations;
  }
  if (f.rubricScores !== undefined) {
    if (
      !Array.isArray(f.rubricScores) ||
      f.rubricScores.length > RUBRIC_SCORES_MAX
    )
      throw new HttpsError('invalid-argument', 'rubricScores are invalid.');
    out.rubricScores = f.rubricScores;
  }
  if (f.excused !== undefined) {
    if (typeof f.excused !== 'boolean')
      throw new HttpsError('invalid-argument', 'excused is invalid.');
    out.excused = f.excused;
  }
  return out;
}

const maxPointsOf = (session: Data): number | undefined => {
  const g = (session.grading ?? {}) as Data;
  return g.mode === 'points' && isNum(g.points) ? g.points : undefined;
};

/** D12/D13: feedback lands only on a frozen copy that still exists; a taken-back copy is never recreated. */
export async function handleSaveWritingFeedback(
  db: Firestore,
  rawCaller: WritingCaller | null,
  data: unknown,
  now: number
): Promise<{ draftId: string; counts: boolean }> {
  const caller = requireCaller(rawCaller);
  const sid = sessionIdOf(data);
  const d = (data ?? {}) as Data;
  if (!isDocumentId(d.studentUid) || !isDocumentId(d.draftId))
    throw new HttpsError(
      'invalid-argument',
      'studentUid and draftId are required.'
    );
  const session = await sessionForTeacher(db, caller, sid);
  const feedback = sanitizeFeedback(d.feedback, caller, now);
  const maxPoints = maxPointsOf(session);
  if (
    maxPoints !== undefined &&
    isNum(feedback.pointsAwarded) &&
    feedback.pointsAwarded > maxPoints
  )
    throw new HttpsError('invalid-argument', 'pointsAwarded is over the total.');
  const ref = responseRef(db, sid, d.studentUid);
  const dRef = ref.collection(WRITING_DRAFTS).doc(d.draftId);
  return db.runTransaction(async (tx): Promise<{ draftId: string; counts: boolean }> => {
    const [snap, draftSnap] = await Promise.all([tx.get(ref), tx.get(dRef)]);
    const r: Data = snap.exists ? (snap.data() ?? {}) : {};
    if (!canSaveFeedback(deriveWritingStatus(r), draftSnap.exists))
      throw new HttpsError(
        'failed-precondition',
        'The student took this work back.',
        { reason: 'taken-back' }
      );
    const draft: Data = draftSnap.data() ?? {};
    const number = isNum(draft.number) ? draft.number : Number(d.draftId);
    tx.update(dRef, { feedback, feedbackAt: now });
    const scored =
      isNum(feedback.pointsAwarded) ||
      Array.isArray(feedback.rubricScores) ||
      feedback.excused === true;
    const current = (r.grade ?? null) as Data | null;
    // D14: the latest graded draft's score counts; an earlier draft's regrade keeps its own.
    const counts =
      scored &&
      (!current || !isNum(current.draftNumber) || number >= current.draftNumber);
    if (counts)
      tx.update(ref, {
        grade: {
          draftId: d.draftId,
          draftNumber: number,
          ...(isNum(feedback.pointsAwarded)
            ? { pointsAwarded: feedback.pointsAwarded }
            : {}),
          ...(maxPoints !== undefined ? { maxPoints } : {}),
          ...(Array.isArray(feedback.rubricScores)
            ? { rubricScores: feedback.rubricScores }
            : {}),
          ...(feedback.excused === true ? { excused: true } : {}),
          gradedAt: now,
        },
        updatedAt: now,
      });
    return { draftId: d.draftId, counts };
  });
}

// ── callables ────────────────────────────────────────────────────────────────

function claimClassIds(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((c): c is string => typeof c === 'string' && c.length > 0)
    : [];
}

export function writingCallerFrom(
  auth: CallableRequest['auth']
): WritingCaller | null {
  if (!auth) return null;
  if (auth.token.firebase?.sign_in_provider === 'anonymous')
    throw new HttpsError('permission-denied', 'Sign in required.');
  return {
    uid: auth.uid,
    student: auth.token.studentRole === true && auth.token.pinLogin !== true,
    classIds: claimClassIds(auth.token.classIds),
  };
}

const OPTIONS = {
  memory: '256MiB' as const,
  timeoutSeconds: 30,
  cors: ALLOWED_ORIGINS,
  invoker: 'public' as const,
};

type Handler<T> = (
  db: Firestore,
  caller: WritingCaller | null,
  data: unknown,
  now: number
) => Promise<T>;

const callable = <T>(handler: Handler<T>, outward = false) =>
  onCall(OPTIONS, async (request) => {
    await assertViewAsAllowed(request, outward ? { outward: true } : undefined);
    return handler(
      admin.firestore(),
      writingCallerFrom(request.auth),
      request.data,
      Date.now()
    );
  });

export const openWritingV1 = callable(handleOpenWriting);
export const turnInWritingV1 = callable(handleTurnInWriting);
export const takeBackWritingV1 = callable(handleTakeBackWriting);
export const turnInTimedWritingV1 = callable(handleTimedTurnIn);
export const returnWritingV1 = callable(
  (db, c, d, now) => handleReturnWriting(db, c, d, now, false),
  true
);
export const returnWritingForRevisionV1 = callable(
  (db, c, d, now) => handleReturnWriting(db, c, d, now, true),
  true
);
export const saveWritingFeedbackV1 = callable(handleSaveWritingFeedback, true);

