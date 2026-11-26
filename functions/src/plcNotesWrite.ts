// PLC meeting, note, recording, note-doc and comment writes, checked here so firestore.rules can drop them.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import { isDeactivatedOperatorMember } from './authz';
import { assertViewAsAllowed } from './viewAsGuard';

if (!admin.apps.length) {
  admin.initializeApp();
}

type Data = Record<string, unknown>;

export const PLC_NOTES_COLLECTIONS = [
  'notes',
  'meetings',
  'recordings',
  'noteDocs',
  'comments',
] as const;
export type PlcNotesCollection = (typeof PLC_NOTES_COLLECTIONS)[number];

export const MAX_WRITES = 5;
const MAX_ID_LENGTH = 200;
const AUDIO_EXPIRY_MAX_MS = 2592000000;

export interface PlcNotesWriteOp {
  coll: PlcNotesCollection;
  id: string;
  op: 'create' | 'update';
  data: Data;
  /** Fields the server stamps with its own time (the client's serverTimestamp()). */
  serverTime: string[];
  /** Read-modify-write precondition: each stored field (number or timestamp millis, null when absent) must still match. */
  expect?: Record<string, number | null>;
}

export interface PlcNotesWriteInput {
  plcId: string;
  writes: PlcNotesWriteOp[];
}

export type PlcNotesWriteReason =
  | 'badRequest'
  | 'plcNotFound'
  | 'notAllowed'
  | 'invalid'
  | 'notFound'
  | 'alreadyExists'
  | 'versionConflict'
  | 'stale';

const CODE_FOR: Record<
  PlcNotesWriteReason,
  | 'invalid-argument'
  | 'not-found'
  | 'permission-denied'
  | 'already-exists'
  | 'failed-precondition'
  | 'aborted'
> = {
  badRequest: 'invalid-argument',
  plcNotFound: 'not-found',
  notAllowed: 'permission-denied',
  invalid: 'permission-denied',
  notFound: 'not-found',
  alreadyExists: 'already-exists',
  versionConflict: 'failed-precondition',
  stale: 'aborted',
};

export class PlcNotesWriteError extends Error {
  constructor(readonly reason: PlcNotesWriteReason) {
    super(reason);
  }
}

/** Stands in for request.time while checking; becomes a server timestamp on write. Never built from JSON. */
export class ServerTime {}
const SERVER_TIME = new ServerTime();

// ── Parsing ──

const isPlainObject = (v: unknown): v is Data =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const isDocId = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= MAX_ID_LENGTH &&
  !v.includes('/') &&
  v !== '.' &&
  v !== '..' &&
  !/^__.*__$/.test(v);

export function parsePlcNotesWrite(raw: unknown): PlcNotesWriteInput {
  const bad = () => new PlcNotesWriteError('badRequest');
  if (!isPlainObject(raw)) throw bad();
  if (!isDocId(raw.plcId)) throw bad();
  const writes = raw.writes;
  if (!Array.isArray(writes) || writes.length < 1 || writes.length > MAX_WRITES)
    throw bad();
  const seen = new Set<string>();
  const out: PlcNotesWriteOp[] = writes.map((w: unknown) => {
    if (!isPlainObject(w)) throw bad();
    const coll = PLC_NOTES_COLLECTIONS.find((c) => c === w.coll);
    if (!coll || !isDocId(w.id)) throw bad();
    if (w.op !== 'create' && w.op !== 'update') throw bad();
    if (!isPlainObject(w.data)) throw bad();
    const serverTime = w.serverTime ?? [];
    if (
      !Array.isArray(serverTime) ||
      !serverTime.every(
        (f) => typeof f === 'string' && keysFor(coll).includes(f)
      )
    )
      throw bad();
    let expect: Record<string, number | null> | undefined;
    if (w.expect !== undefined) {
      if (!isPlainObject(w.expect)) throw bad();
      for (const [k, v] of Object.entries(w.expect))
        if (
          !keysFor(coll).includes(k) ||
          (v !== null && (typeof v !== 'number' || !Number.isFinite(v)))
        )
          throw bad();
      expect = w.expect as Record<string, number | null>;
    }
    const key = `${coll}/${w.id}`;
    if (seen.has(key)) throw bad();
    seen.add(key);
    return {
      coll,
      id: w.id,
      op: w.op,
      data: w.data,
      serverTime: serverTime as string[],
      ...(expect ? { expect } : {}),
    };
  });
  return { plcId: raw.plcId, writes: out };
}

// ── Value predicates, matching the rules' `is` checks ──

const has = (d: Data, k: string) => Object.prototype.hasOwnProperty.call(d, k);
const isStr = (v: unknown): v is string => typeof v === 'string';
// Firestore stores only safe integers (and not -0) as int; anything else is a double the rules refuse.
const isInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0);
const isList = (v: unknown): v is unknown[] => Array.isArray(v);

function isTimestampLike(v: unknown): boolean {
  if (v instanceof ServerTime) return true;
  if (!v || typeof v !== 'object') return false;
  const t = v as {
    toMillis?: unknown;
    seconds?: unknown;
    nanoseconds?: unknown;
  };
  return (
    typeof t.toMillis === 'function' &&
    typeof t.seconds === 'number' &&
    typeof t.nanoseconds === 'number'
  );
}

/** plcSubTimeFieldOk: get(field, 0) is timestamp || int. */
const timeOk = (d: Data, k: string) => {
  const v = has(d, k) ? d[k] : 0;
  return isTimestampLike(v) || isInt(v);
};
/** plcSubDeletedAtOk: get('deletedAt', null) is null, timestamp or int. */
const deletedAtOk = (d: Data) => {
  const v = has(d, 'deletedAt') ? d.deletedAt : null;
  return v === null || isTimestampLike(v) || isInt(v);
};
const optStr = (d: Data, k: string) => !has(d, k) || isStr(d[k]);
const optNullStr = (d: Data, k: string) =>
  !has(d, k) || d[k] === null || isStr(d[k]);
const optListMax = (d: Data, k: string, n: number) =>
  !has(d, k) || (isList(d[k]) && d[k].length <= n);
const keysOnly = (d: Data, keys: readonly string[]) =>
  Object.keys(d).every((k) => keys.includes(k));

/** Firestore value equality: timestamps by instant, lists and maps by content. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof ServerTime || b instanceof ServerTime) return false;
  if (isTimestampLike(a) || isTimestampLike(b)) {
    if (!isTimestampLike(a) || !isTimestampLike(b)) return false;
    const x = a as { seconds: number; nanoseconds: number };
    const y = b as { seconds: number; nanoseconds: number };
    return x.seconds === y.seconds && x.nanoseconds === y.nanoseconds;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((v, i) => valuesEqual(v, b[i]));
  }
  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => has(b, k) && valuesEqual(a[k], b[k]));
  }
  return a === b;
}

/** unchanged(k): both docs carry k (a missing key denies, as in rules) and the values match. */
const unchanged = (next: Data, prev: Data, k: string) =>
  has(next, k) && has(prev, k) && valuesEqual(next[k], prev[k]);

// ── Per-collection checks, one per rule branch ──

const NOTE_KEYS = [
  'id', 'title', 'body', 'kind', 'meetingId', 'actionItems', 'createdBy',
  'createdAt', 'lastEditedBy', 'lastEditedAt', 'version', 'deletedAt', 'yState',
  'blocks', 'meetingAt',
] as const; // prettier-ignore
const MEETING_KEYS = [
  'id', 'heldAt', 'facilitatorUid', 'attendeeUids', 'assessmentIds', 'agenda',
  'decisions', 'actionItems', 'notesBody', 'status', 'createdBy', 'updatedAt',
  'deletedAt',
] as const; // prettier-ignore
const RECORDING_REQUIRED = [
  'noteId', 'recorderUid', 'status', 'parts', 'durationMs', 'lastHeartbeatAt',
  'createdAt',
] as const; // prettier-ignore
const RECORDING_KEYS = [...RECORDING_REQUIRED, 'audioExpiresAt'] as const;
const RECORDING_LIVE_KEYS = [
  'status',
  'parts',
  'durationMs',
  'lastHeartbeatAt',
];
const NOTE_DOC_KEYS = ['fileId', 'url', 'createdBy', 'createdAt'] as const;
const keysFor = (coll: PlcNotesCollection): readonly string[] =>
  ({
    notes: NOTE_KEYS,
    meetings: MEETING_KEYS,
    recordings: RECORDING_KEYS,
    noteDocs: NOTE_DOC_KEYS,
    comments: COMMENT_KEYS,
  })[coll];
const COMMENT_KEYS = [
  'id', 'targetType', 'targetId', 'authorUid', 'authorName', 'body', 'mentions',
  'createdAt', 'editedAt', 'deletedAt',
] as const; // prettier-ignore

/** Fields shared by the notes create and update rules. */
function noteShapeOk(d: Data): boolean {
  return (
    keysOnly(d, NOTE_KEYS) &&
    isStr(d.title) &&
    isStr(d.body) &&
    (!has(d, 'kind') || d.kind === 'freeform' || d.kind === 'meeting') &&
    optNullStr(d, 'meetingId') &&
    optListMax(d, 'actionItems', 200) &&
    optStr(d, 'yState') &&
    optListMax(d, 'blocks', 100) &&
    (!has(d, 'meetingAt') || d.meetingAt === null || isInt(d.meetingAt)) &&
    deletedAtOk(d)
  );
}

/** Fields shared by the meetings create and update rules. */
function meetingShapeOk(d: Data): boolean {
  return (
    keysOnly(d, MEETING_KEYS) &&
    isList(d.attendeeUids) &&
    isList(d.assessmentIds) &&
    isList(d.decisions) &&
    isList(d.actionItems) &&
    optStr(d, 'agenda') &&
    optStr(d, 'notesBody') &&
    (d.status === 'in-progress' || d.status === 'completed') &&
    deletedAtOk(d)
  );
}

/** plcRecordingLiveOk. */
function recordingLiveOk(d: Data): boolean {
  return (
    isList(d.parts) &&
    d.parts.length <= 200 &&
    isInt(d.durationMs) &&
    d.durationMs >= 0 &&
    d.durationMs <= 3660000 &&
    timeOk(d, 'lastHeartbeatAt')
  );
}

const editedAtOk = (d: Data) =>
  !has(d, 'editedAt') ||
  d.editedAt === null ||
  isInt(d.editedAt) ||
  isTimestampLike(d.editedAt);

function commentShapeOk(d: Data): boolean {
  return (
    keysOnly(d, COMMENT_KEYS) &&
    isStr(d.body) &&
    editedAtOk(d) &&
    deletedAtOk(d)
  );
}

export interface CheckContext {
  uid: string;
  nowMs: number;
  /** For recordings: whether plcs/{plcId}/notes/{noteId} exists. */
  noteExists?: boolean;
}

export type CheckResult = 'ok' | 'invalid' | 'versionConflict';

/** The rule for one write: `next` is the post-merge document, `prev` the stored one (update only). */
export function checkWrite(
  coll: PlcNotesCollection,
  docId: string,
  prev: Data | null,
  next: Data,
  ctx: CheckContext
): CheckResult {
  if (coll === 'notes' && prev) {
    const rest =
      noteShapeOk(next) &&
      unchanged(next, prev, 'id') &&
      unchanged(next, prev, 'createdBy') &&
      unchanged(next, prev, 'createdAt') &&
      next.lastEditedBy === ctx.uid &&
      timeOk(next, 'lastEditedAt');
    if (!rest) return 'invalid';
    // A teammate's edit landed first: the client reloads.
    return noteVersionOk(prev, next) ? 'ok' : 'versionConflict';
  }
  return ruleAllows(coll, docId, prev, next, ctx) ? 'ok' : 'invalid';
}

function ruleAllows(
  coll: PlcNotesCollection,
  docId: string,
  prev: Data | null,
  next: Data,
  ctx: CheckContext
): boolean {
  const { uid } = ctx;
  switch (coll) {
    case 'notes':
      // Updates are checked in checkWrite.
      return (
        !prev &&
        noteShapeOk(next) &&
        next.id === docId &&
        next.createdBy === uid &&
        next.lastEditedBy === uid &&
        (!has(next, 'version') || isInt(next.version)) &&
        timeOk(next, 'createdAt') &&
        timeOk(next, 'lastEditedAt')
      );
    case 'meetings':
      if (!prev)
        return (
          meetingShapeOk(next) &&
          next.id === docId &&
          next.createdBy === uid &&
          isStr(next.facilitatorUid) &&
          timeOk(next, 'heldAt') &&
          timeOk(next, 'updatedAt')
        );
      return (
        meetingShapeOk(next) &&
        unchanged(next, prev, 'id') &&
        unchanged(next, prev, 'createdBy') &&
        unchanged(next, prev, 'heldAt') &&
        unchanged(next, prev, 'facilitatorUid') &&
        timeOk(next, 'updatedAt')
      );
    case 'recordings':
      if (!prev)
        return (
          RECORDING_REQUIRED.every((k) => has(next, k)) &&
          keysOnly(next, RECORDING_KEYS) &&
          isStr(next.noteId) &&
          ctx.noteExists === true &&
          next.recorderUid === uid &&
          next.status === 'recording' &&
          recordingLiveOk(next) &&
          timeOk(next, 'createdAt') &&
          (!has(next, 'audioExpiresAt') ||
            (isInt(next.audioExpiresAt) &&
              next.audioExpiresAt <= ctx.nowMs + AUDIO_EXPIRY_MAX_MS))
        );
      return (
        prev.recorderUid === uid &&
        (prev.status === 'recording' || prev.status === 'paused') &&
        (next.status === 'recording' || next.status === 'paused') &&
        affectedKeys(prev, next).every((k) =>
          RECORDING_LIVE_KEYS.includes(k)
        ) &&
        recordingLiveOk(next)
      );
    case 'noteDocs':
      // Create-only: the first teammate's doc wins.
      if (prev) return false;
      return (
        keysOnly(next, NOTE_DOC_KEYS) &&
        isStr(next.fileId) &&
        isStr(next.url) &&
        /^https:\/\/docs[.]google[.]com\/.*$/.test(next.url) &&
        next.createdBy === uid &&
        timeOk(next, 'createdAt')
      );
    case 'comments':
      if (!prev)
        return (
          commentShapeOk(next) &&
          next.id === docId &&
          next.authorUid === uid &&
          (next.targetType === 'dataCard' ||
            next.targetType === 'assessment' ||
            next.targetType === 'note') &&
          isStr(next.targetId) &&
          isStr(next.authorName) &&
          isList(next.mentions) &&
          timeOk(next, 'createdAt')
        );
      return (
        commentShapeOk(next) &&
        unchanged(next, prev, 'id') &&
        unchanged(next, prev, 'targetType') &&
        unchanged(next, prev, 'targetId') &&
        unchanged(next, prev, 'authorUid') &&
        unchanged(next, prev, 'authorName') &&
        unchanged(next, prev, 'createdAt') &&
        unchanged(next, prev, 'mentions') &&
        // Only the author changes body or editedAt; anyone else may only flip deletedAt.
        (uid === prev.authorUid ||
          (unchanged(next, prev, 'body') &&
            valuesEqual(
              has(next, 'editedAt') ? next.editedAt : null,
              has(prev, 'editedAt') ? prev.editedAt : null
            )))
      );
  }
}

/** The notes update version rule: new == old + 1, or both absent. */
function noteVersionOk(prev: Data, next: Data): boolean {
  const inNext = has(next, 'version');
  const inPrev = has(prev, 'version');
  if (!inNext && !inPrev) return true;
  return (
    inNext &&
    inPrev &&
    typeof prev.version === 'number' &&
    typeof next.version === 'number' &&
    next.version === prev.version + 1
  );
}

/** request.resource.data.diff(resource.data).affectedKeys(). */
function affectedKeys(prev: Data, next: Data): string[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return [...keys].filter(
    (k) => has(prev, k) !== has(next, k) || !valuesEqual(prev[k], next[k])
  );
}

/** plcCanEditContent: in memberUids, role not viewer. A malformed members map denies, as the rule's get() would. */
export function canEditPlcContent(plc: Data, uid: string): boolean {
  if (!Array.isArray(plc.memberUids) || !plc.memberUids.includes(uid))
    return false;
  if (!has(plc, 'members')) return true;
  if (!isPlainObject(plc.members)) return false;
  if (!has(plc.members, uid)) return true;
  const entry = plc.members[uid];
  if (!isPlainObject(entry)) return false;
  return entry.role !== 'viewer';
}

/** Stored field value as millis for `expect`: number, timestamp millis, or null when absent. */
function storedMillis(d: Data | null, k: string): number | null {
  if (!d || !has(d, k) || d[k] === null) return null;
  const v = d[k];
  if (typeof v === 'number') return Math.floor(v);
  if (isTimestampLike(v) && !(v instanceof ServerTime))
    return Math.floor((v as { toMillis: () => number }).toMillis());
  return null;
}

/** The write as checked (server-time fields as ServerTime) and as stored (server timestamps). */
function materialize(
  w: PlcNotesWriteOp,
  serverTimestamp: unknown
): { check: Data; store: Data } {
  const check: Data = { ...w.data };
  const store: Data = { ...w.data };
  for (const f of w.serverTime) {
    check[f] = SERVER_TIME;
    store[f] = serverTimestamp;
  }
  return { check, store };
}

export interface Caller {
  uid: string;
  emailLower: string;
  pinLogin: boolean;
}

/** Runs the writes in one transaction after the same checks the rules made; all or nothing. */
export async function runPlcNotesWrite(
  db: admin.firestore.Firestore,
  caller: Caller,
  input: PlcNotesWriteInput,
  {
    serverTimestamp = admin.firestore.FieldValue.serverTimestamp(),
    nowMs = Date.now(),
  }: { serverTimestamp?: unknown; nowMs?: number } = {}
): Promise<{ ok: true }> {
  // authUid() is noUid for a PIN token, and notDeactivated() refuses a revoked operator-org member.
  if (
    caller.pinLogin ||
    (caller.emailLower &&
      (await isDeactivatedOperatorMember(db, caller.emailLower)))
  )
    throw new PlcNotesWriteError('notAllowed');
  return db.runTransaction(async (tx) => {
    const plcRef = db.doc(`plcs/${input.plcId}`);
    const refs = input.writes.map((w) =>
      db.doc(`plcs/${input.plcId}/${w.coll}/${w.id}`)
    );
    const noteRefs = input.writes.map((w) =>
      w.coll === 'recordings' && w.op === 'create' && isDocId(w.data.noteId)
        ? db.doc(`plcs/${input.plcId}/notes/${w.data.noteId}`)
        : null
    );
    const [plcSnap, ...snaps] = await Promise.all([
      tx.get(plcRef),
      ...refs.map((r) => tx.get(r)),
    ]);
    const noteSnaps = await Promise.all(
      noteRefs.map((r) => (r ? tx.get(r) : Promise.resolve(null)))
    );
    if (!plcSnap.exists) throw new PlcNotesWriteError('plcNotFound');
    if (!canEditPlcContent(plcSnap.data() ?? {}, caller.uid))
      throw new PlcNotesWriteError('notAllowed');

    const planned = input.writes.map((w, i) => {
      const snap = snaps[i];
      const prev = snap.exists ? (snap.data() ?? {}) : null;
      if (w.op === 'create' && prev)
        throw new PlcNotesWriteError('alreadyExists');
      if (w.op === 'update' && !prev) throw new PlcNotesWriteError('notFound');
      for (const [field, value] of Object.entries(w.expect ?? {}))
        if (
          storedMillis(prev, field) !==
          (value === null ? null : Math.floor(value))
        )
          throw new PlcNotesWriteError('stale');
      const { check, store } = materialize(w, serverTimestamp);
      const next = prev ? { ...prev, ...check } : check;
      const result = checkWrite(w.coll, w.id, prev, next, {
        uid: caller.uid,
        nowMs,
        noteExists: noteSnaps[i]?.exists === true,
      });
      if (result !== 'ok') throw new PlcNotesWriteError(result);
      return { ref: refs[i], op: w.op, store };
    });
    for (const p of planned) {
      if (p.op === 'create') tx.create(p.ref, p.store);
      else tx.update(p.ref, p.store);
    }
    return { ok: true as const };
  });
}

export const plcNotesWriteV1 = onCall(
  { memory: '512MiB', timeoutSeconds: 30, maxInstances: 20 },
  async (request): Promise<{ ok: true }> => {
    await assertViewAsAllowed(request);
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in first.');
    const token = request.auth.token as Data;
    try {
      const input = parsePlcNotesWrite(request.data);
      return await runPlcNotesWrite(
        admin.firestore(),
        {
          uid: request.auth.uid,
          emailLower:
            typeof token.email === 'string'
              ? token.email.trim().toLowerCase()
              : '',
          pinLogin: token.pinLogin === true,
        },
        input
      );
    } catch (err) {
      if (err instanceof PlcNotesWriteError)
        throw new HttpsError(CODE_FOR[err.reason], err.reason, {
          reason: err.reason,
        });
      throw err;
    }
  }
);
