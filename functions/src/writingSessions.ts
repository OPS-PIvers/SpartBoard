// Writing sessions: assign (snapshot the Library item), delete, and the cleanup that removes responses, copies and logs (D21).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { assertViewAsAllowed } from './viewAsGuard';
import { isDistrictStaffToken } from './districtStaff';
import { isWidgetGranted } from './featureGrant';
import {
  parseRef,
  refKey,
  sanitizeOverride,
  type StudentTargetRef,
} from './studentAssignmentTargets';
import { WRITING_RESPONSES, WRITING_SESSIONS } from './writingResponses';
import {
  CLASS_NOT_TAUGHT_MESSAGE,
  refusedClassTargets,
} from './verifiedClassList';

export const WRITING_RECORDS = 'writing_assignment_records';
const WRITING_LIBRARY = 'writing_assignments';

type Data = Record<string, unknown>;

const MAX_CLASSES = 60;
const MAX_TIME_LIMIT_MINUTES = 600;
const TAB_AWAY_MIN = 5;
const TAB_AWAY_MAX = 300;

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const strings = (v: unknown, max = MAX_CLASSES): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v.filter(
            (x): x is string =>
              typeof x === 'string' && x.length > 0 && x.length <= 300
          )
        ),
      ].slice(0, max)
    : [];

const optTime = (v: unknown): number | null => (isNum(v) ? v : null);

function numberMap(v: unknown): Record<string, number> | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Data).slice(0, MAX_CLASSES))
    if (isNum(n)) out[k] = n;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The library fields a session snapshots (title, prompt, stimuli, word limits, grading with its rubric). */
export function snapshotLibraryItem(item: Data): Data {
  const grading = (item.grading ?? {}) as Data;
  const mode = grading.mode;
  const snapGrading =
    mode === 'points' && isNum(grading.points)
      ? { mode, points: grading.points }
      : mode === 'rubric' &&
          typeof grading.rubricId === 'string' &&
          typeof grading.rubricSnapshot === 'object'
        ? {
            mode,
            rubricId: grading.rubricId,
            rubricSnapshot: grading.rubricSnapshot,
          }
        : { mode: 'ungraded' };
  return {
    title:
      typeof item.title === 'string' && item.title.trim()
        ? item.title
        : 'Untitled writing assignment',
    prompt: typeof item.prompt === 'string' ? item.prompt : '',
    ...(Array.isArray(item.stimuli) && item.stimuli.length > 0
      ? { stimuli: item.stimuli }
      : {}),
    ...(isNum(item.minWords) ? { minWords: item.minWords } : {}),
    ...(isNum(item.maxWords) ? { maxWords: item.maxWords } : {}),
    ...(item.enforceWordLimit === true ? { enforceWordLimit: true } : {}),
    grading: snapGrading,
  };
}

/** The assign step's settings: D8, D10, D11, D4, D7 and Focus mode. */
export function sessionSettings(d: Data): Data {
  const minutes = isNum(d.timeLimitMinutes)
    ? Math.round(d.timeLimitMinutes)
    : 0;
  const away = isNum(d.tabAwayLimitSeconds)
    ? Math.min(
        TAB_AWAY_MAX,
        Math.max(TAB_AWAY_MIN, Math.round(d.tabAwayLimitSeconds))
      )
    : undefined;
  return {
    allowPaste: d.allowPaste === true,
    recordingNotice: d.recordingNotice !== false,
    studentCanViewRecord: d.studentCanViewRecord === true,
    spellCheck: d.spellCheck !== false,
    ...(minutes > 0
      ? { timeLimitMinutes: Math.min(MAX_TIME_LIMIT_MINUTES, minutes) }
      : {}),
    tabWarningsEnabled: d.tabWarningsEnabled !== false,
    ...(away !== undefined ? { tabAwayLimitSeconds: away } : {}),
    ...(d.blockPrint === true ? { blockPrint: true } : {}),
    ...(d.focusLevel === 'lock' ? { focusLevel: 'lock' } : {}),
  };
}

const PERIOD_STATES = ['open', 'paused', 'closed'];
const PERIOD_FIELDS = [
  'state',
  'openAt',
  'closeAt',
  'pausedAt',
  'closedAt',
  'openedAt',
] as const;
const PERIOD_KEY_RE = /^[^/]{1,300}$/;

/** A Manual assign's per-class gate (the stepper's buildPeriodGate), kept to its known fields. */
export function sanitizePeriodAccess(v: unknown): Data | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const out: Data = {};
  for (const [k, raw] of Object.entries(v as Data).slice(0, MAX_CLASSES)) {
    if (!PERIOD_KEY_RE.test(k) || typeof raw !== 'object' || raw === null)
      continue;
    const p = raw as Data;
    if (typeof p.state !== 'string' || !PERIOD_STATES.includes(p.state))
      continue;
    out[k] = {
      state: p.state,
      openAt: optTime(p.openAt),
      closeAt: optTime(p.closeAt),
      bellPeriodId: typeof p.bellPeriodId === 'string' ? p.bellPeriodId : null,
      verified: p.verified === true,
      label: typeof p.label === 'string' ? p.label.slice(0, 200) : '',
      ...(typeof p.rosterId === 'string' ? { rosterId: p.rosterId } : {}),
      ...(isNum(p.pausedAt) ? { pausedAt: p.pausedAt } : {}),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function overrides(v: unknown): Data | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const out: Data = {};
  for (const [k, raw] of Object.entries(v as Data).slice(0, 250)) {
    const o = sanitizeOverride(raw);
    if (o) out[k] = o;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface AssignWritingCaller {
  uid: string;
  /** District staff or an admin; resolved by the callable. */
  staff: boolean;
  email?: string;
}

// Missing doc follows WIDGET_DEFAULT_ACCESS_LEVEL.writing (admins first, plan D19).
const writingWidgetGranted = (db: Firestore, caller: AssignWritingCaller) =>
  isWidgetGranted(db, 'writing', caller.email ?? null, caller.uid, 'admin');

/** Writes the session and the teacher's record in one batch; the client then calls setAssignmentTargetsV1. */
export async function handleAssignWriting(
  db: Firestore,
  caller: AssignWritingCaller | null,
  data: unknown,
  now: number,
  newId: () => string = randomUUID,
  granted: typeof writingWidgetGranted = writingWidgetGranted
): Promise<{ sessionId: string }> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!caller.staff)
    throw new HttpsError('permission-denied', 'Teacher account required.');
  if (!(await granted(db, caller)))
    throw new HttpsError(
      'permission-denied',
      'Writing assignments are not turned on for your account.'
    );
  const d = (data ?? {}) as Data;
  if (typeof d.itemId !== 'string' || !d.itemId || d.itemId.includes('/'))
    throw new HttpsError('invalid-argument', 'itemId is required.');
  const itemSnap = await db
    .collection('users')
    .doc(caller.uid)
    .collection(WRITING_LIBRARY)
    .doc(d.itemId)
    .get();
  if (!itemSnap.exists)
    throw new HttpsError('not-found', 'Writing assignment not found.');
  const snapshot = snapshotLibraryItem(itemSnap.data() ?? {});
  const settings = sessionSettings(d);
  const classIds = strings(d.classIds);
  // Same class targeting check firestore.rules applies to client-written sessions.
  if ((await refusedClassTargets(db, caller.uid, classIds)).length > 0)
    throw new HttpsError('permission-denied', CLASS_NOT_TAUGHT_MESSAGE);
  const periodNames = strings(d.periodNames);
  const rosterIds = strings(d.rosterIds);
  const dueAtByClassId = numberMap(d.dueAtByClassId);
  const windows = {
    openAt: optTime(d.openAt),
    closeAt: optTime(d.closeAt),
    dueAt: optTime(d.dueAt),
    ...(dueAtByClassId ? { dueAtByClassId } : {}),
    ...(typeof d.dueLocks === 'boolean' ? { dueLocks: d.dueLocks } : {}),
  };
  const periodAccess = sanitizePeriodAccess(d.periodAccess);
  const gate = periodAccess
    ? {
        accessMode: d.accessMode === 'assignment' ? 'assignment' : 'assessment',
        periodAccess,
      }
    : {};
  const sessionId = newId();
  const session = {
    id: sessionId,
    teacherUid: caller.uid,
    itemId: d.itemId,
    ...snapshot,
    ...settings,
    classIds,
    classId: classIds[0] ?? '',
    ...(periodNames.length > 0 ? { periodNames } : {}),
    ...(rosterIds.length > 0 ? { rosterIds } : {}),
    status: 'active',
    ...windows,
    ...gate,
    workKind: 'work',
    createdAt: now,
    updatedAt: now,
  };
  const targetGroupIds = strings(d.targetGroupIds);
  const overridesBySourcedId = overrides(d.overridesBySourcedId);
  const record = {
    id: sessionId,
    sessionId,
    itemId: d.itemId,
    title: snapshot.title,
    teacherUid: caller.uid,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    rosterIds,
    classIds,
    periodNames,
    ...windows,
    ...gate,
    ...(isNum(settings.timeLimitMinutes)
      ? { timeLimitMinutes: settings.timeLimitMinutes }
      : {}),
    ...(targetGroupIds.length > 0 ? { targetGroupIds } : {}),
    ...(overridesBySourcedId ? { overridesBySourcedId } : {}),
  };
  const batch = db.batch();
  batch.create(db.collection(WRITING_SESSIONS).doc(sessionId), session);
  batch.create(
    db
      .collection('users')
      .doc(caller.uid)
      .collection(WRITING_RECORDS)
      .doc(sessionId),
    record
  );
  await batch.commit();
  return { sessionId };
}

/** Deletes the session and the record; the triggers below remove responses, copies, logs and pointers. */
export async function handleDeleteWritingSession(
  db: Firestore,
  caller: AssignWritingCaller | null,
  data: unknown
): Promise<{ deleted: boolean }> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!caller.staff)
    throw new HttpsError('permission-denied', 'Teacher account required.');
  const sid = (data as Data | null)?.sessionId;
  if (typeof sid !== 'string' || !sid || sid.includes('/'))
    throw new HttpsError('invalid-argument', 'sessionId is required.');
  const ref = db.collection(WRITING_SESSIONS).doc(sid);
  const snap = await ref.get();
  if (snap.exists && snap.get('teacherUid') !== caller.uid)
    throw new HttpsError('permission-denied', 'Not your assignment.');
  const batch = db.batch();
  if (snap.exists) batch.delete(ref);
  batch.delete(
    db.collection('users').doc(caller.uid).collection(WRITING_RECORDS).doc(sid)
  );
  await batch.commit();
  return { deleted: snap.exists };
}

/** Ends an active session; it moves to the teacher's Completed tab and the student's Completed list. */
export async function handleEndWritingSession(
  db: Firestore,
  caller: AssignWritingCaller | null,
  data: unknown,
  now: number
): Promise<{ ended: boolean }> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!caller.staff)
    throw new HttpsError('permission-denied', 'Teacher account required.');
  const sid = (data as Data | null)?.sessionId;
  if (typeof sid !== 'string' || !sid || sid.includes('/'))
    throw new HttpsError('invalid-argument', 'sessionId is required.');
  const ref = db.collection(WRITING_SESSIONS).doc(sid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Assignment not found.');
  if (snap.get('teacherUid') !== caller.uid)
    throw new HttpsError('permission-denied', 'Not your assignment.');
  if (snap.get('status') === 'ended') return { ended: false };
  const patch = { status: 'ended', endedAt: now, updatedAt: now };
  const batch = db.batch();
  batch.update(ref, patch);
  batch.set(
    db.collection('users').doc(caller.uid).collection(WRITING_RECORDS).doc(sid),
    patch,
    { merge: true }
  );
  await batch.commit();
  return { ended: true };
}

const WINDOW_KEYS = ['openAt', 'closeAt', 'dueAt'] as const;
const MAX_REFS = 2000;

function refList(v: unknown): StudentTargetRef[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: StudentTargetRef[] = [];
  for (const raw of v.slice(0, MAX_REFS)) {
    const ref = parseRef(raw);
    if (ref) out.push(ref);
  }
  return out;
}

/** Applies one period's field patch to a stored row; unknown periods and fields are dropped. */
function patchPeriods(stored: unknown, patch: unknown): Data | null {
  if (typeof patch !== 'object' || patch === null) return null;
  if (typeof stored !== 'object' || stored === null) return null;
  const next: Data = { ...(stored as Data) };
  let changed = false;
  for (const [k, raw] of Object.entries(patch as Data)) {
    const row = next[k];
    if (typeof row !== 'object' || row === null) continue;
    if (typeof raw !== 'object' || raw === null) continue;
    const p = raw as Data;
    const out: Data = { ...(row as Data) };
    for (const f of PERIOD_FIELDS) {
      if (!(f in p)) continue;
      if (f === 'state') {
        if (typeof p.state === 'string' && PERIOD_STATES.includes(p.state))
          out.state = p.state;
      } else out[f] = optTime(p[f]);
    }
    next[k] = out;
    changed = true;
  }
  return changed ? next : null;
}

/** D24/D21: a class is finished once the teacher closed it or its close time passed; Ready is not. */
function classFinished(row: unknown, now: number): boolean {
  if (typeof row !== 'object' || row === null) return false;
  const p = row as Data;
  if (p.state === 'closed') return isNum(p.closedAt);
  if (p.state === 'paused') return false;
  return isNum(p.closeAt) && p.closeAt <= now;
}

/** Teacher edits from the hub and Start/Pause/Let in; no client writes a Writing session. */
export async function handleUpdateWritingSession(
  db: Firestore,
  caller: AssignWritingCaller | null,
  data: unknown,
  now: number
): Promise<{ updated: boolean; assignedTab?: true }> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!caller.staff)
    throw new HttpsError('permission-denied', 'Teacher account required.');
  const d = (data ?? {}) as Data;
  const sid = d.sessionId;
  if (typeof sid !== 'string' || !sid || sid.includes('/'))
    throw new HttpsError('invalid-argument', 'sessionId is required.');
  const ref = db.collection(WRITING_SESSIONS).doc(sid);
  const recordRef = db
    .collection('users')
    .doc(caller.uid)
    .collection(WRITING_RECORDS)
    .doc(sid);
  return db.runTransaction(async (tx) => {
    const [snap, recordSnap] = await Promise.all([
      tx.get(ref),
      tx.get(recordRef),
    ]);
    if (!snap.exists)
      throw new HttpsError('not-found', 'Assignment not found.');
    const session: Data = snap.data() ?? {};
    if (session.teacherUid !== caller.uid)
      throw new HttpsError('permission-denied', 'Not your assignment.');
    const record: Data = recordSnap.exists ? (recordSnap.data() ?? {}) : {};
    const shared: Data = {};
    const window = (d.window ?? {}) as Data;
    for (const k of WINDOW_KEYS)
      if (k in window) shared[k] = optTime(window[k]);
    const periods = patchPeriods(session.periodAccess, d.periodAccess);
    if (periods) shared.periodAccess = periods;
    const sessionOnly: Data = {};
    if (typeof d.studentAccess === 'object' && d.studentAccess !== null) {
      const passes: Data = {
        ...((session.studentAccess ?? {}) as Data),
      };
      for (const [uid, until] of Object.entries(d.studentAccess as Data).slice(
        0,
        MAX_REFS
      ))
        if (isNum(until) && !uid.includes('/') && !uid.includes('.'))
          passes[uid] = until;
      sessionOnly.studentAccess = passes;
    }
    const recordOnly: Data = {};
    const r = (d.record ?? {}) as Data;
    if (Array.isArray(r.targetGroupIds))
      recordOnly.targetGroupIds = strings(r.targetGroupIds, 200);
    if (typeof r.overrides === 'object' && r.overrides !== null) {
      const map: Data = {
        ...((record.overridesBySourcedId ?? {}) as Data),
      };
      for (const [k, raw] of Object.entries(r.overrides as Data).slice(
        0,
        MAX_REFS
      )) {
        if (!/^(classlink|test):/.test(k)) continue;
        const o = raw === null ? null : sanitizeOverride(raw);
        if (o) map[k] = o;
        else delete map[k];
      }
      recordOnly.overridesBySourcedId = map;
    }
    const excluded = refList(r.excludedTargets);
    if (excluded) recordOnly.excludedTargets = excluded;
    if (isNum(r.targetSkippedCount))
      recordOnly.targetSkippedCount = Math.max(
        0,
        Math.round(r.targetSkippedCount)
      );
    const removed = refList(r.removedStudentRefs);
    if (removed && removed.length > 0) {
      const prior = refList(record.removedStudentRefs) ?? [];
      const keys = new Set(prior.map((x) => refKey(x)));
      recordOnly.removedStudentRefs = [
        ...prior,
        ...removed.filter((x) => !keys.has(refKey(x))),
      ].slice(-MAX_REFS);
    }
    // Assigned tab (ASSIGNED_TAB.md D21, D24, D5): reopen, end and the record's closedAt/doneAt marks.
    const ended = session.status === 'ended';
    const rows = shared.periodAccess ?? session.periodAccess;
    const allClosed =
      typeof rows === 'object' &&
      rows !== null &&
      Object.keys(rows).length > 0 &&
      Object.values(rows as Data).every((row) => classFinished(row, now));
    if (d.reopen === true && ended) {
      shared.status = 'active';
      shared.endedAt = FieldValue.delete();
      recordOnly.closedAt = null;
      recordOnly.doneAt = null;
    } else if (
      !ended &&
      (d.end === true || (d.endIfAllClosed === true && allClosed))
    ) {
      shared.status = 'ended';
      shared.endedAt = now;
    }
    const marks =
      typeof d.marks === 'object' && d.marks !== null ? (d.marks as Data) : {};
    for (const k of ['closedAt', 'doneAt'] as const)
      if (k in marks) recordOnly[k] = optTime(marks[k]);
    const sessionPatch = { ...shared, ...sessionOnly };
    const recordPatch = { ...shared, ...recordOnly };
    if (
      Object.keys(sessionPatch).length === 0 &&
      Object.keys(recordPatch).length === 0
    )
      return { updated: false, assignedTab: true };
    if (Object.keys(sessionPatch).length > 0)
      tx.update(ref, { ...sessionPatch, updatedAt: now });
    if (recordSnap.exists)
      tx.update(recordRef, { ...recordPatch, updatedAt: now });
    // Tells a newer client this server applied reopen, end and marks.
    return { updated: true, assignedTab: true };
  });
}

/** D21: a deleted session takes its responses, frozen copies and log chunks with it, however it was deleted. */
export async function deleteWritingSessionData(
  db: Firestore,
  sessionId: string
): Promise<void> {
  const session = db.collection(WRITING_SESSIONS).doc(sessionId);
  await db.recursiveDelete(session.collection(WRITING_RESPONSES));
  await db.recursiveDelete(session.collection('peer_links'));
}

async function callerFrom(
  db: Firestore,
  auth: CallableRequest['auth']
): Promise<AssignWritingCaller | null> {
  if (!auth) return null;
  const token = auth.token;
  if (token.studentRole === true || token.pinLogin === true)
    return { uid: auth.uid, staff: false };
  const email =
    typeof token.email === 'string' ? token.email.toLowerCase() : '';
  const staff =
    (await isDistrictStaffToken(db, token)) ||
    (token.email_verified === true &&
      email.length > 0 &&
      (await db.doc(`admins/${email}`).get()).exists);
  return { uid: auth.uid, staff, ...(email ? { email } : {}) };
}

const OPTIONS = {
  memory: '256MiB' as const,
  timeoutSeconds: 60,
  cors: ALLOWED_ORIGINS,
  invoker: 'public' as const,
};

export const assignWritingV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request, { outward: true });
  const db = admin.firestore();
  return handleAssignWriting(
    db,
    await callerFrom(db, request.auth),
    request.data,
    Date.now()
  );
});

export const deleteWritingSessionV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request, { outward: true });
  const db = admin.firestore();
  return handleDeleteWritingSession(
    db,
    await callerFrom(db, request.auth),
    request.data
  );
});

export const endWritingSessionV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request, { outward: true });
  const db = admin.firestore();
  return handleEndWritingSession(
    db,
    await callerFrom(db, request.auth),
    request.data,
    Date.now()
  );
});

export const updateWritingSessionV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request, { outward: true });
  const db = admin.firestore();
  return handleUpdateWritingSession(
    db,
    await callerFrom(db, request.auth),
    request.data,
    Date.now()
  );
});

export const cleanupWritingSessionData = onDocumentDeleted(
  {
    document: `${WRITING_SESSIONS}/{sessionId}`,
    memory: '512MiB',
    timeoutSeconds: 540,
    maxInstances: 5,
  },
  async (event) => {
    await deleteWritingSessionData(admin.firestore(), event.params.sessionId);
    logger.info('cleanupWritingSessionData: responses removed', {
      sessionId: event.params.sessionId,
    });
  }
);
