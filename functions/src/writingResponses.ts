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
import { isPeriodFrozen } from './quizSessionContent';
import {
  WRITING_CLOSE_GRACE_MS,
  WRITING_HTML_MAX_BYTES,
  WRITING_TIMED_FLUSH_GRACE_MS,
  canSaveFeedback,
  countWritingWords,
  deriveWritingStatus,
  resolveWritingCloseAt,
  resolveWritingDueAt,
  takeBackBlock,
  timedTurnInDue,
  turnInBlock,
  writingDeadline,
  writingEventAllowed,
  writingGradingMax,
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

const TAB_ID_MAX = 100;
const COMMENT_MAX = 10_000;
const ANNOTATIONS_MAX = 300;
const RUBRIC_SCORES_MAX = 50;
/** Feedback JSON in bytes; with the text cap a frozen copy stays under 1 MiB. */
const FEEDBACK_MAX_BYTES = 300_000;
const SUMMARY_KEYS = [
  'wordCount',
  'savedAt',
  'writingMs',
  'sessions',
  'pasteCount',
  'pastedChars',
  'untypedCount',
  'untypedChars',
  'awayMs',
  'awayCount',
  'logStoppedAt',
] as const;

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

const utf8Bytes = (s: string): number => Buffer.byteLength(s, 'utf8');

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
const draftRef = (response: DocumentReference, id: string) =>
  response.collection(WRITING_DRAFTS).doc(id);
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

/** Only the known summary numbers, so a client can't grow a frozen copy through it. */
function cleanSummary(raw: unknown): Data {
  const src = typeof raw === 'object' && raw !== null ? (raw as Data) : {};
  const out: Data = {};
  for (const k of SUMMARY_KEYS) if (isNum(src[k])) out[k] = src[k];
  return out;
}

/** The student's own flush: final text and summary from the holding tab (D24). */
interface Flush {
  html: string;
  summary: Data;
  saveCount: number;
}

function flushOf(data: unknown): Flush | null {
  const d = (data ?? {}) as Data;
  if (d.html === undefined) return null;
  if (typeof d.html !== 'string' || utf8Bytes(d.html) > WRITING_HTML_MAX_BYTES)
    throw new HttpsError('invalid-argument', 'html is too long.');
  if (!isNum(d.saveCount))
    throw new HttpsError('invalid-argument', 'saveCount is required.');
  return {
    html: d.html,
    summary: cleanSummary(d.summary),
    saveCount: d.saveCount,
  };
}

/** D23/D24 for a student's own turn in: the holding tab only; a resent current counter carries no new text. */
function freshFlush(
  response: Data,
  tabId: string,
  flush: Flush | null
): Flush | null {
  if (response.tabId !== tabId)
    throw new HttpsError(
      'failed-precondition',
      'This piece is open in another tab.',
      { reason: 'stale-tab' }
    );
  if (!flush) return null;
  const saved = isNum(response.saveCount) ? response.saveCount : 0;
  if (flush.saveCount === saved) return null;
  if (flush.saveCount < saved)
    throw new HttpsError('failed-precondition', 'A newer save exists.', {
      reason: 'stale-save',
    });
  return flush;
}

/** The timed turn in takes a flush only from the holding tab, newer than the save and inside the grace; else it is ignored. */
function timedFlush(
  response: Data,
  tabId: string | null,
  flush: Flush | null,
  now: number
): Flush | null {
  if (!flush || tabId === null || response.tabId !== tabId) return null;
  if (!isNum(response.deadlineAt)) return null;
  if (now > response.deadlineAt + WRITING_TIMED_FLUSH_GRACE_MS) return null;
  const saved = isNum(response.saveCount) ? response.saveCount : 0;
  return flush.saveCount > saved ? flush : null;
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

/** Manual (per-period) sessions: the student's class must be started, or the student let in. */
function assertPeriodOpen(
  session: Data,
  uid: string,
  classId: unknown,
  now: number
): void {
  if (isPeriodFrozen(session, { studentUid: uid, classId }, now))
    throw new HttpsError(
      'failed-precondition',
      "Your class period isn't open right now.",
      { reason: 'paused' }
    );
}

const draftSeqOf = (response: Data): number =>
  isNum(response.draftSeq)
    ? response.draftSeq
    : isNum(response.draftCount)
      ? response.draftCount
      : 0;

/** Writes a frozen copy under a never-reused id (D12: a taken-back id is never handed out again). */
function freezeDraft(
  tx: Transaction,
  ref: DocumentReference,
  response: Data,
  html: string,
  summary: Data,
  logLength: number,
  by: WritingTurnedInBy,
  now: number
): { draftCount: number; draftId: string } {
  if (utf8Bytes(html) > WRITING_HTML_MAX_BYTES)
    throw new HttpsError('failed-precondition', 'This piece is too long.', {
      reason: 'too-large',
    });
  const seq = draftSeqOf(response) + 1;
  const draftId = String(seq);
  const number = (isNum(response.draftCount) ? response.draftCount : 0) + 1;
  tx.set(draftRef(ref, draftId), {
    number,
    seq,
    ...(typeof response.latestDraftId === 'string'
      ? { prevDraftId: response.latestDraftId }
      : {}),
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
    draftSeq: seq,
    latestDraftId: draftId,
    turnedInAt: now,
    turnedInBy: by,
    updatedAt: now,
  });
  return { draftCount: number, draftId };
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

/** Freezes the piece with an optional flush already judged fresh; reads come first, as transactions need. */
async function freezeWith(
  tx: Transaction,
  ref: DocumentReference,
  r: Data,
  flush: Flush | null,
  by: WritingTurnedInBy,
  now: number
): Promise<WritingStatusResult> {
  const html = flush ? flush.html : typeof r.html === 'string' ? r.html : '';
  const logLength = await openLogLength(tx, ref, r);
  const summary = {
    ...cleanSummary(r.summary),
    ...(flush?.summary ?? {}),
    wordCount: countWritingWords(html),
  };
  if (flush) tx.update(ref, { html, summary, saveCount: flush.saveCount });
  const { draftCount, draftId } = freezeDraft(
    tx,
    ref,
    r,
    html,
    summary,
    logLength,
    by,
    now
  );
  return { status: 'turned-in', draftCount, latestDraftId: draftId };
}

// ── openWritingV1 ────────────────────────────────────────────────────────────

export interface OpenWritingResult {
  created: boolean;
  status: WritingResponseStatus;
  saveCount: number;
  deadlineAt: number | null;
  /** The open log chunk's index and every chunk up to it, so the holding tab appends instead of replacing (B2). */
  logChunk: number;
  logs: string[];
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
      const logChunk = isNum(r.logChunk) ? Math.min(r.logChunk, 9) : 0;
      const chunks = await Promise.all(
        Array.from({ length: logChunk + 1 }, (_, i) =>
          tx.get(ref.collection(WRITING_LOG).doc(String(i)))
        )
      );
      const logs = chunks.map((c) => {
        const log: unknown = c.exists ? c.get('log') : '';
        return typeof log === 'string' ? log : '';
      });
      return {
        created: false,
        status: deriveWritingStatus(r),
        saveCount: isNum(r.saveCount) ? r.saveCount : 0,
        deadlineAt: isNum(r.deadlineAt) ? r.deadlineAt : null,
        logChunk,
        logs,
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
    // The clock must not start while the class is paused.
    assertPeriodOpen(session, caller.uid, classId, now);
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
      draftSeq: 0,
      updatedAt: now,
    });
    return {
      created: true,
      status: 'draft',
      saveCount: 0,
      deadlineAt,
      logChunk: 0,
      logs: [''],
    };
  });
}

// ── turnInWritingV1 ──────────────────────────────────────────────────────────

export interface WritingStatusResult {
  status: WritingResponseStatus;
  draftCount: number;
  /** The newest frozen copy's id, absent when none is left. */
  latestDraftId?: string;
}

/** The student turns the piece in from the holding tab; past a timed deadline it goes through the timed path. */
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
    const closeAt = resolveWritingCloseAt(session, pointer.closeAt);
    if (closeAt !== null && now > closeAt + WRITING_CLOSE_GRACE_MS)
      throw new HttpsError('failed-precondition', 'Cannot turn this in.', {
        reason: 'closed',
      });
    // Past the clock the timer's rules apply: no word limits, a stale flush is dropped.
    if (
      isNum(r.deadlineAt) &&
      timedTurnInDue(now, r.deadlineAt) &&
      (status === 'draft' || status === 'revising')
    )
      return freezeWith(
        tx,
        ref,
        r,
        timedFlush(r, tabId, flush, now),
        'timer',
        now
      );
    const fresh = freshFlush(r, tabId, flush);
    assertPeriodOpen(session, caller.uid, r.classId, now);
    const html = fresh ? fresh.html : typeof r.html === 'string' ? r.html : '';
    const block = turnInBlock(status, {
      now,
      closeAt,
      wordCount: countWritingWords(html),
      minWords: isNum(session.minWords) ? session.minWords : undefined,
      maxWords: isNum(session.maxWords) ? session.maxWords : undefined,
      enforceWordLimit: session.enforceWordLimit === true,
    });
    if (block)
      throw new HttpsError('failed-precondition', 'Cannot turn this in.', {
        reason: block,
      });
    return freezeWith(tx, ref, r, fresh, 'student', now);
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
    if (!snap.exists)
      throw new HttpsError('not-found', 'Nothing to take back.');
    const r: Data = snap.data() ?? {};
    const count = isNum(r.draftCount) ? r.draftCount : 0;
    const latest =
      typeof r.latestDraftId === 'string'
        ? draftRef(ref, r.latestDraftId)
        : null;
    const draftSnap = latest ? await tx.get(latest) : null;
    const draft: Data = draftSnap?.exists ? (draftSnap.data() ?? {}) : {};
    const facts = {
      now,
      dueAt: resolveWritingDueAt(
        session,
        typeof r.classId === 'string' ? r.classId : null,
        pointer.dueAt
      ),
      hasFeedback:
        draft.feedback != null ||
        isNum(draft.feedbackAt) ||
        draft.grade != null,
      timed: isNum(r.deadlineAt),
      closeAt: resolveWritingCloseAt(session, pointer.closeAt),
    };
    const status = deriveWritingStatus(r);
    const block = !draftSnap?.exists
      ? 'not-turned-in'
      : takeBackBlock(status, facts);
    if (block || !latest)
      throw new HttpsError('failed-precondition', 'Cannot take this back.', {
        reason: block,
      });
    const left = Math.max(0, count - 1);
    const event: WritingEvent = { type: 'take-back', facts, draftsLeft: left };
    const prev =
      typeof draft.prevDraftId === 'string' ? draft.prevDraftId : undefined;
    tx.delete(latest);
    tx.update(ref, {
      status: writingTransition(status, event),
      draftCount: left,
      // draftSeq stays where it is, so the next turn in gets a new id.
      draftSeq: draftSeqOf(r),
      latestDraftId: prev ?? FieldValue.delete(),
      turnedInAt: FieldValue.delete(),
      turnedInBy: FieldValue.delete(),
      updatedAt: now,
    });
    return {
      status: writingTransition(status, event),
      draftCount: left,
      ...(prev ? { latestDraftId: prev } : {}),
    };
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
      return {
        status,
        draftCount: count,
        ...(typeof r.latestDraftId === 'string'
          ? { latestDraftId: r.latestDraftId }
          : {}),
      };
    if (!isNum(r.deadlineAt))
      throw new HttpsError('failed-precondition', 'This piece is not timed.');
    if (!timedTurnInDue(now, r.deadlineAt))
      throw new HttpsError('failed-precondition', 'Time is not up yet.', {
        reason: 'early',
      });
    return freezeWith(
      tx,
      ref,
      r,
      timedFlush(r, tabId, flush, now),
      'timer',
      now
    );
  });
}

// ── returnWritingV1 / returnWritingForRevisionV1 ────────────────────────────

/** Newest first, following each copy's link to the one before it. */
async function draftChain(
  tx: Transaction,
  ref: DocumentReference,
  latestId: unknown
): Promise<Array<{ id: string; data: Data }>> {
  const out: Array<{ id: string; data: Data }> = [];
  let id = typeof latestId === 'string' ? latestId : null;
  while (id && out.length < 100 && !out.some((d) => d.id === id)) {
    const snap = await tx.get(draftRef(ref, id));
    if (!snap.exists) break;
    const data: Data = snap.data() ?? {};
    out.push({ id, data });
    id = typeof data.prevDraftId === 'string' ? data.prevDraftId : null;
  }
  return out;
}

/** D14 for the student's view: the newest returned copy with a score; the teacher's draft scores stay on the copies. */
function returnedGrade(
  chain: Array<{ id: string; data: Data }>,
  returningId: string | null
): Data | null {
  for (const d of chain)
    if (
      d.data.grade != null &&
      (d.id === returningId || isNum(d.data.returnedAt))
    )
      return d.data.grade as Data;
  return null;
}

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
    const chain = await draftChain(tx, ref, r.latestDraftId);
    const latest = chain[0];
    if (!latest || !writingEventAllowed(status, event))
      throw new HttpsError('failed-precondition', 'Nothing to return.', {
        reason:
          typeof r.latestDraftId === 'string' && !latest
            ? 'taken-back'
            : 'not-turned-in',
      });
    const next = writingTransition(status, event);
    const grade = returnedGrade(chain, latest.id);
    tx.update(draftRef(ref, latest.id), {
      returnedAt: now,
      returnKind: revise ? 'revision' : 'return',
    });
    tx.update(ref, {
      status: next,
      returnedAt: now,
      // Only what the student may now see: the returned score that counts.
      grade: grade ?? FieldValue.delete(),
      // A revision is untimed (D7): the clock ends with the first sitting.
      ...(revise
        ? {
            deadlineAt: FieldValue.delete(),
            timerStartedAt: FieldValue.delete(),
          }
        : {}),
      updatedAt: now,
    });
    if (typeof d.studentCanViewRecord === 'boolean')
      tx.update(sessionRef(db, sid), {
        studentCanViewRecord: d.studentCanViewRecord,
        updatedAt: now,
      });
    return { status: next, draftCount: count, latestDraftId: latest.id };
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
    if (!Array.isArray(f.annotations) || f.annotations.length > ANNOTATIONS_MAX)
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
  if (utf8Bytes(JSON.stringify(out)) > FEEDBACK_MAX_BYTES)
    throw new HttpsError('invalid-argument', 'feedback is too long.');
  return out;
}

const maxPointsOf = (session: Data): number | undefined =>
  writingGradingMax(session.grading) ?? undefined;

/** D12/D13: feedback lands only on the frozen copy the teacher saw; a taken-back copy is never recreated. */
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
  if (!isNum(d.turnedInAt))
    throw new HttpsError('invalid-argument', 'turnedInAt is required.');
  const draftId = d.draftId;
  const session = await sessionForTeacher(db, caller, sid);
  const feedback = sanitizeFeedback(d.feedback, caller, now);
  const maxPoints = maxPointsOf(session);
  if (
    ((session.grading ?? {}) as Data).mode === 'ungraded' &&
    (feedback.pointsAwarded !== undefined ||
      feedback.rubricScores !== undefined ||
      feedback.excused !== undefined)
  )
    throw new HttpsError('invalid-argument', 'This piece is ungraded.');
  if (
    maxPoints !== undefined &&
    isNum(feedback.pointsAwarded) &&
    feedback.pointsAwarded > maxPoints
  )
    throw new HttpsError(
      'invalid-argument',
      'pointsAwarded is over the total.'
    );
  const ref = responseRef(db, sid, d.studentUid);
  return db.runTransaction(
    async (tx): Promise<{ draftId: string; counts: boolean }> => {
      const snap = await tx.get(ref);
      const r: Data = snap.exists ? (snap.data() ?? {}) : {};
      const chain = await draftChain(tx, ref, r.latestDraftId);
      const at = chain.findIndex((c) => c.id === draftId);
      const draft = at >= 0 ? chain[at].data : null;
      // The copy must be the one the teacher graded: same id and same turn in.
      if (
        !draft ||
        draft.turnedInAt !== d.turnedInAt ||
        !canSaveFeedback(deriveWritingStatus(r), true)
      )
        throw new HttpsError(
          'failed-precondition',
          'The student took this work back.',
          { reason: 'taken-back' }
        );
      const scored =
        isNum(feedback.pointsAwarded) ||
        Array.isArray(feedback.rubricScores) ||
        feedback.excused === true;
      const number = isNum(draft.number) ? draft.number : Number(draftId);
      const grade = scored
        ? {
            draftId,
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
          }
        : null;
      tx.update(draftRef(ref, draftId), {
        feedback,
        feedbackAt: now,
        grade: grade ?? FieldValue.delete(),
      });
      // D14: the latest graded copy's score counts; an earlier copy's regrade keeps its own.
      const counts =
        scored && chain.slice(0, at).every((c) => c.data.grade == null);
      // A copy the student already sees updates the score they see; otherwise it waits for Return.
      if (isNum(draft.returnedAt)) {
        const after = chain.map((c, i) =>
          i === at ? { id: c.id, data: { ...c.data, grade } } : c
        );
        const visible = returnedGrade(after, null);
        tx.update(ref, {
          grade: visible ?? FieldValue.delete(),
          updatedAt: now,
        });
      }
      return { draftId, counts };
    }
  );
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

const run = <T>(
  request: CallableRequest,
  handler: (
    db: Firestore,
    caller: WritingCaller | null,
    data: unknown,
    now: number
  ) => Promise<T>
) =>
  handler(
    admin.firestore(),
    writingCallerFrom(request.auth),
    request.data,
    Date.now()
  );

export const openWritingV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request);
  return run(request, handleOpenWriting);
});

export const turnInWritingV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request);
  return run(request, handleTurnInWriting);
});

export const takeBackWritingV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request);
  return run(request, handleTakeBackWriting);
});

export const turnInTimedWritingV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request);
  return run(request, handleTimedTurnIn);
});

export const returnWritingV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request, { outward: true });
  return run(request, (db, c, d, now) =>
    handleReturnWriting(db, c, d, now, false)
  );
});

export const returnWritingForRevisionV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request, { outward: true });
  return run(request, (db, c, d, now) =>
    handleReturnWriting(db, c, d, now, true)
  );
});

export const saveWritingFeedbackV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request, { outward: true });
  return run(request, handleSaveWritingFeedback);
});
