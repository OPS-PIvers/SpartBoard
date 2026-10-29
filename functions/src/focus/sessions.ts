// Teacher focus-session actions (docs/plans/CHROME_EXTENSION.md F1, F6, F7, F8, F11); onCall wrappers are in sessionCallables.ts.
import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import type * as admin from 'firebase-admin';
import {
  computeStudentUid,
  isStudentDomainEmail,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
} from '../classlinkShared';
import {
  shortId,
  verifySubCaller,
  verifySubShare,
  type SubShareCaller,
} from '../subShareAccess';
import {
  DEFAULT_FOCUS_LEVEL,
  FOCUS_LEVELS,
  FOCUS_MAX_SITES,
  FOCUS_RETENTION_DAYS,
  FOCUS_SESSIONS_COLLECTION,
  FOCUS_SETTINGS_DOC,
  FOCUS_STUDENTS_SUBCOLLECTION,
  FOCUS_TTL_FIELD,
  isFocusSite,
  normalizeFocusSites,
  type FocusAddSiteReply,
  type FocusEndReply,
  type FocusExtendReply,
  type FocusLevel,
  type FocusOpenReply,
  type FocusReleaseReply,
  type FocusSessionDoc,
  type FocusSite,
  type FocusStartReply,
  type FocusStudentDoc,
  type FocusStudentSummary,
  type FocusWindow,
} from './shared.gen';
import {
  focusExtendEndsAt,
  focusStartEndsAt,
  focusWindowEndsAt,
  parseFocusWindow,
} from './window';

type Firestore = admin.firestore.Firestore;
type DocRef = admin.firestore.DocumentReference;

/** The Focus widget's permission row (F15); a missing row passes admins only. */
export const FOCUS_WIDGET_TYPE = 'focus';
/** A real class is far smaller; this keeps a session doc and its conflict queries bounded. */
export const FOCUS_MAX_STUDENTS = 300;
const MAX_NAME_LENGTH = 100;
/** `array-contains-any` takes at most 30 values. */
const CONFLICT_CHUNK = 30;
const BATCH_LIMIT = 450;
const DAY_MS = 86_400_000;
/** Per-class lock that makes "one running session per class" hold under concurrent starts. */
export const FOCUS_CLASS_LOCKS_COLLECTION = 'focus_class_locks';
/** How long the sweep keeps finishing ends that died partway. */
const UNFINISHED_END_LOOKBACK_MS = 60 * 60_000;

/** Expiry stamped at creation, so docs from a start or end that died partway are still deleted. */
const provisionalExpiry = (startedAt: number) =>
  Timestamp.fromMillis(startedAt + (FOCUS_RETENTION_DAYS + 1) * DAY_MS);
const finalExpiry = (endedAt: number) =>
  Timestamp.fromMillis(endedAt + FOCUS_RETENTION_DAYS * DAY_MS);

export interface FocusCaller extends SubShareCaller {
  name: string | null;
}

export interface FocusDeps {
  now: () => number;
  hmacSecret: () => string;
  /** ClassLink sourcedIds of the class's students, or null when the caller doesn't teach it (loadTaughtClassEnrollment). */
  taughtClassEnrollment: (
    teacherEmail: string,
    classId: string
  ) => Promise<Set<string> | null>;
  /** Dev: any teacher who owns a roster for a mock class may use it; elsewhere only admins (F3). */
  mockClassesOpen: () => boolean;
}

const bad = (message: string): never => {
  throw new HttpsError('invalid-argument', message);
};
const denied = (message: string): never => {
  throw new HttpsError('permission-denied', message);
};
const precondition = (message: string): never => {
  throw new HttpsError('failed-precondition', message);
};

const sessionsCol = (db: Firestore) => db.collection(FOCUS_SESSIONS_COLLECTION);
const studentsCol = (ref: DocRef) =>
  ref.collection(FOCUS_STUDENTS_SUBCOLLECTION);

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const text = value.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
  return text || fallback;
}

/** A verified district staff account; students, anonymous and unverified accounts are refused. */
function verifyTeacher(caller: FocusCaller | null): {
  caller: FocusCaller;
  email: string;
} {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in first.');
  const email = (caller.email ?? '').toLowerCase();
  if (
    caller.anonymous ||
    caller.studentRole ||
    !email ||
    isStudentDomainEmail(email)
  ) {
    denied('Focus sessions are for teacher accounts.');
  }
  if (!caller.emailVerified) denied('A verified account is required.');
  return { caller, email };
}

/** Mirrors canAccessWidget for the `focus` row, except a missing row fails closed to admins. */
export async function canUseFocusWidget(
  db: Firestore,
  emailLower: string
): Promise<boolean> {
  const [perm, adminDoc] = await Promise.all([
    db.doc(`feature_permissions/${FOCUS_WIDGET_TYPE}`).get(),
    db.doc(`admins/${emailLower}`).get(),
  ]);
  const isAdmin = adminDoc.exists;
  if (!perm.exists) return isAdmin;
  const data = perm.data() ?? {};
  if (data.enabled !== true) return false;
  if (isAdmin || data.accessLevel === 'public') return true;
  if (data.accessLevel !== 'beta') return false;
  // Lazy: quizMediaArchive pulls heavy deps the other focus paths don't need.
  const { isBetaTeacher } = await import('../quizMediaArchive');
  const betaUsers: unknown[] = Array.isArray(data.betaUsers)
    ? (data.betaUsers as unknown[])
    : [];
  return isBetaTeacher(db, betaUsers, emailLower);
}

/** Start, Extend and Add site follow the widget permission; Release and End never do, so a session can always be stopped. */
async function requireFocusWidget(db: Firestore, email: string): Promise<void> {
  if (!(await canUseFocusWidget(db, email)))
    denied('Focus sessions are not turned on for your account.');
}

async function loadWindow(db: Firestore): Promise<FocusWindow> {
  const snap = await db.doc(`admin_settings/${FOCUS_SETTINGS_DOC}`).get();
  return parseFocusWindow(snap.data()?.window);
}

/** Pseudonym uids of the class's students when the caller teaches it (ClassLink, or a mock class whose roster they own), else null. */
export async function taughtClassStudentUids(
  db: Firestore,
  caller: { uid: string; email: string },
  classId: string,
  deps: FocusDeps
): Promise<{ orgId: string; studentUids: string[] } | null> {
  const domain = normalizeEmailDomain(caller.email);
  const orgId = domain ? await resolveOrgIdForDomain(db, domain) : null;
  if (!orgId) denied('Your account is not part of a school on SpartBoard.');
  const org = orgId as string;
  const hmac = deps.hmacSecret();
  if (!hmac) throw new HttpsError('internal', 'Server configuration missing.');

  // Mock class (F3): dev has no ClassLink, so the class is the admin-managed testClasses doc, as in getPseudonymsForAssignmentV1.
  const testClass = await db
    .doc(`organizations/${org}/testClasses/${classId}`)
    .get();
  if (testClass.exists) {
    const [member, owned] = await Promise.all([
      db.doc(`organizations/${org}/members/${caller.email}`).get(),
      db
        .collection(`users/${caller.uid}/rosters`)
        .where('testClassId', '==', classId)
        .limit(1)
        .get(),
    ]);
    if (!member.exists || owned.empty) return null;
    if (
      !deps.mockClassesOpen() &&
      !(await db.doc(`admins/${caller.email}`).get()).exists
    )
      return null;
    const raw: unknown = testClass.data()?.memberEmails;
    const emails = Array.isArray(raw)
      ? raw.filter((e): e is string => typeof e === 'string' && e.length > 0)
      : [];
    const uids = emails.map((e) =>
      computeStudentUid(`test:${e.toLowerCase()}`, hmac)
    );
    return { orgId: org, studentUids: [...new Set(uids)] };
  }

  const enrolled = await deps.taughtClassEnrollment(caller.email, classId);
  if (!enrolled) return null;
  const uids = [...enrolled].map((id) => computeStudentUid(id, hmac));
  return { orgId: org, studentUids: [...new Set(uids)] };
}

function isActive(session: FocusSessionDoc, now: number): boolean {
  return session.endedAt === null && session.endsAt > now;
}

function readSession(snap: admin.firestore.DocumentSnapshot): FocusSessionDoc {
  if (!snap.exists) throw new HttpsError('not-found', 'That session is gone.');
  return snap.data() as FocusSessionDoc;
}

/** A teacher on the session, or a co-teacher of its class who is added to `teacherUids` on first use (F1). */
async function authorizeSessionTeacher(
  db: Firestore,
  ref: DocRef,
  session: FocusSessionDoc,
  caller: FocusCaller,
  email: string,
  deps: FocusDeps
): Promise<void> {
  if (session.teacherUids.includes(caller.uid)) return;
  const taught = await taughtClassStudentUids(
    db,
    { uid: caller.uid, email },
    session.classId,
    deps
  );
  if (!taught || taught.orgId !== session.orgId)
    denied('You do not teach this class.');
  await db.runTransaction(async (tx) => {
    const fresh = readSession(await tx.get(ref));
    if (!fresh.teacherUids.includes(caller.uid))
      tx.update(ref, { teacherUids: [...fresh.teacherUids, caller.uid] });
  });
}

/** A substitute with a live share from one of the session's teachers that covers its class (F8). */
async function authorizeSessionSub(
  db: Firestore,
  session: FocusSessionDoc,
  caller: FocusCaller,
  shareIdInput: unknown,
  now: number
): Promise<{ expiresAt: number }> {
  const { email } = verifySubCaller(caller);
  const shareId = shortId(shareIdInput, 'shareId');
  const { share, hostUid, expiresAt } = await verifySubShare(
    db,
    shareId,
    email,
    now
  );
  if (!session.teacherUids.includes(hostUid))
    denied('That share is not from a teacher of this class.');
  const rosterIds = (
    Array.isArray(share.sharedRosters) ? (share.sharedRosters as unknown[]) : []
  )
    .map((r) =>
      r && typeof r === 'object' ? (r as { id?: unknown }).id : undefined
    )
    .filter(
      (id): id is string =>
        typeof id === 'string' && id.length > 0 && !id.includes('/')
    );
  const rosters = await Promise.all(
    rosterIds.map((id) => db.doc(`users/${hostUid}/rosters/${id}`).get())
  );
  const covers = rosters.some((snap) => {
    const data = snap.data();
    return (
      !!data && (data.classlinkClassId ?? data.testClassId) === session.classId
    );
  });
  if (!covers) denied('That share does not cover this class.');
  return { expiresAt };
}

/** Teachers act on their own; a substitute passes `shareId` and may only release and end (F8). */
async function authorizeTeacherOrSub(
  db: Firestore,
  ref: DocRef,
  session: FocusSessionDoc,
  caller: FocusCaller | null,
  shareId: unknown,
  deps: FocusDeps
): Promise<void> {
  if (shareId !== undefined && shareId !== null) {
    if (!caller) throw new HttpsError('unauthenticated', 'Sign in first.');
    await authorizeSessionSub(db, session, caller, shareId, deps.now());
    return;
  }
  const { caller: teacher, email } = verifyTeacher(caller);
  await authorizeSessionTeacher(db, ref, session, teacher, email, deps);
}

function parseSites(raw: unknown): FocusSite[] {
  if (!Array.isArray(raw) || raw.length === 0) bad('Add at least one site.');
  const list = raw as unknown[];
  if (list.length > FOCUS_MAX_SITES)
    bad(`A session allows at most ${FOCUS_MAX_SITES} sites.`);
  if (!list.every(isFocusSite)) bad('One of the sites is not a web address.');
  return normalizeFocusSites(list);
}

function parseLevel(raw: unknown): FocusLevel {
  if (raw === undefined || raw === null) return DEFAULT_FOCUS_LEVEL;
  if (!FOCUS_LEVELS.includes(raw as FocusLevel))
    bad('level must be monitor, redirect or lock.');
  return raw as FocusLevel;
}

interface ActiveHolding {
  ref: DocRef;
  session: FocusSessionDoc;
}

/** Every active session that lists any of `studentUids`. */
async function activeSessionsWith(
  db: Firestore,
  studentUids: readonly string[],
  now: number
): Promise<ActiveHolding[]> {
  const found = new Map<string, ActiveHolding>();
  for (const chunk of chunks(studentUids, CONFLICT_CHUNK)) {
    const snap = await sessionsCol(db)
      .where('studentUids', 'array-contains-any', chunk)
      .where('endedAt', '==', null)
      .get();
    for (const doc of snap.docs) {
      const session = doc.data() as FocusSessionDoc;
      if (isActive(session, now)) found.set(doc.id, { ref: doc.ref, session });
    }
  }
  return [...found.values()];
}

const byStart = (a: ActiveHolding, b: ActiveHolding) =>
  a.session.startedAt - b.session.startedAt || a.ref.id.localeCompare(b.ref.id);

/**
 * F7: a student belongs to the earliest-started active session that lists them and hasn't released them;
 * later sessions mark them `other-session` until it ends, then `waiting`.
 */
export async function refreshFocusConflicts(
  db: Firestore,
  studentUids: readonly string[],
  now: number
): Promise<void> {
  if (studentUids.length === 0) return;
  const sessions = (await activeSessionsWith(db, studentUids, now)).sort(
    byStart
  );
  const pairs = [...new Set(studentUids)].flatMap((uid) =>
    sessions
      .filter((s) => s.session.studentUids.includes(uid))
      .map((s) => ({
        uid,
        ref: studentsCol(s.ref).doc(uid),
        session: s.session,
      }))
  );
  const snaps = await Promise.all(pairs.map((p) => p.ref.get()));
  const holders = new Map<string, FocusSessionDoc>();
  const writes: OpenStudentPatch[] = [];
  // `pairs` keeps each student's sessions in start order, so the first unreleased one holds them.
  pairs.forEach((pair, i) => {
    const student = snaps[i].data() as FocusStudentDoc | undefined;
    if (!student || student.status === 'released') return;
    const holder = holders.get(pair.uid);
    if (!holder) {
      holders.set(pair.uid, pair.session);
      if (student.status === 'other-session')
        writes.push({
          ref: pair.ref,
          patch: (cur) =>
            cur.status === 'other-session'
              ? { status: 'waiting', otherSessionEndsAt: null }
              : null,
        });
      return;
    }
    if (
      student.status === 'other-session' &&
      student.otherSessionEndsAt === holder.endsAt
    )
      return;
    writes.push({
      ref: pair.ref,
      patch: (cur) =>
        cur.status === 'released'
          ? null
          : {
              status: 'other-session',
              otherSessionEndsAt: holder.endsAt,
              liveHost: null,
              ...settleAway(cur, now),
            },
    });
  });
  await patchOpenStudents(db, writes);
}

interface OpenStudentPatch {
  ref: DocRef;
  patch: (current: FocusStudentDoc) => Partial<FocusStudentDoc> | null;
}

/** Applies each patch to the student's current doc in its own transaction, skipping sessions that ended meanwhile so a collapsed summary is never rewritten. */
async function patchOpenStudents(
  db: Firestore,
  patches: readonly OpenStudentPatch[]
): Promise<string[]> {
  const applied = await Promise.all(
    patches.map(({ ref, patch }) =>
      db.runTransaction(async (tx) => {
        const sessionRef = ref.parent.parent as DocRef;
        const [session, student] = await Promise.all([
          tx.get(sessionRef),
          tx.get(ref),
        ]);
        if (!session.exists || session.get('endedAt') !== null) return null;
        if (!student.exists) return null;
        const data = student.data() as FocusStudentDoc;
        if (data.status === ('ended' as string)) return null;
        const next = patch(data);
        if (!next) return null;
        tx.update(ref, next);
        return ref.id;
      })
    )
  );
  return applied.filter((id): id is string => id !== null);
}

const freshStudent = (expiresAt: Timestamp): FocusStudentDoc => ({
  status: 'waiting',
  awaySince: null,
  awayMs: 0,
  blockedTries: 0,
  lastReportAt: null,
  protocol: null,
  liveHost: null,
  otherSessionEndsAt: null,
  [FOCUS_TTL_FIELD]: expiresAt,
});

const classLockRef = (db: Firestore, orgId: string, classId: string) =>
  db.collection(FOCUS_CLASS_LOCKS_COLLECTION).doc(`${orgId}__${classId}`);

/** The class's running session id, read through its lock. */
async function runningSessionFor(
  read: (ref: DocRef) => Promise<admin.firestore.DocumentSnapshot>,
  db: Firestore,
  lock: admin.firestore.DocumentSnapshot,
  now: number
): Promise<string | null> {
  const id: unknown = lock.get('sessionId');
  if (typeof id !== 'string' || !id) return null;
  const snap = await read(sessionsCol(db).doc(id));
  return snap.exists && isActive(snap.data() as FocusSessionDoc, now)
    ? id
    : null;
}

export async function handleFocusStart(
  db: Firestore,
  callerIn: FocusCaller | null,
  data: unknown,
  deps: FocusDeps
): Promise<FocusStartReply> {
  const { caller, email } = verifyTeacher(callerIn);
  const input = (data ?? {}) as Record<string, unknown>;
  const classId = shortId(input.classId, 'classId');
  const level = parseLevel(input.level);
  const sites = parseSites(input.sites);
  const minutes = input.minutes;
  if (typeof minutes !== 'number') bad('minutes must be a number.');

  await requireFocusWidget(db, email);

  const now = deps.now();
  const window = await loadWindow(db);
  const time = focusStartEndsAt(now, minutes as number, window);
  if (!time.ok) {
    if (time.reason === 'bad-length') bad('Pick a length of 1 to 60 minutes.');
    precondition('Focus sessions can only run during the school day.');
  }
  const endsAt = (time as { ok: true; endsAt: number }).endsAt;

  const taught = await taughtClassStudentUids(
    db,
    { uid: caller.uid, email },
    classId,
    deps
  );
  if (!taught) denied('You do not teach that class.');
  const { orgId, studentUids } = taught as {
    orgId: string;
    studentUids: string[];
  };
  if (studentUids.length === 0) precondition('That class has no students.');
  if (studentUids.length > FOCUS_MAX_STUDENTS)
    precondition('That class is too large for one focus session.');

  const lockRef = classLockRef(db, orgId, classId);
  const running = 'That class already has a focus session running.';
  // Cheap check first, so a refused start writes no student docs.
  if (await runningSessionFor((r) => r.get(), db, await lockRef.get(), now))
    precondition(running);

  const ref = sessionsCol(db).doc();
  const session: FocusSessionDoc = {
    orgId,
    classId,
    className: cleanName(input.className, 'Class'),
    teacherUid: caller.uid,
    teacherName: cleanName(caller.name, email.split('@')[0]),
    teacherUids: [caller.uid],
    level,
    sites,
    studentUids,
    startedAt: now,
    endsAt,
    endedAt: null,
    endReason: null,
    [FOCUS_TTL_FIELD]: provisionalExpiry(now),
  };
  // Students first, so a status check that finds the session also finds their doc.
  for (const part of chunks(studentUids, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const uid of part)
      batch.set(
        studentsCol(ref).doc(uid),
        freshStudent(provisionalExpiry(now))
      );
    await batch.commit();
  }
  await db.runTransaction(async (tx) => {
    const lock = await tx.get(lockRef);
    if (await runningSessionFor((r) => tx.get(r), db, lock, now))
      precondition(running);
    tx.set(lockRef, { sessionId: ref.id, startedAt: now });
    tx.set(ref, session);
  });
  await refreshFocusConflicts(db, studentUids, now);

  const others = await Promise.all(
    studentUids.map((uid) => studentsCol(ref).doc(uid).get())
  );
  return {
    sessionId: ref.id,
    endsAt,
    studentCount: studentUids.length,
    otherSessionCount: others.filter(
      (s) =>
        (s.data() as FocusStudentDoc | undefined)?.status === 'other-session'
    ).length,
  };
}

async function loadActive(
  db: Firestore,
  data: unknown,
  now: number
): Promise<{
  input: Record<string, unknown>;
  ref: DocRef;
  session: FocusSessionDoc;
}> {
  const input = (data ?? {}) as Record<string, unknown>;
  const ref = sessionsCol(db).doc(shortId(input.sessionId, 'sessionId'));
  const session = readSession(await ref.get());
  if (!isActive(session, now)) precondition('That session has ended.');
  return { input, ref, session };
}

export async function handleFocusExtend(
  db: Firestore,
  callerIn: FocusCaller | null,
  data: unknown,
  deps: FocusDeps
): Promise<FocusExtendReply> {
  const { caller, email } = verifyTeacher(callerIn);
  const { ref, session } = await loadActive(db, data, deps.now());
  await authorizeSessionTeacher(db, ref, session, caller, email, deps);
  await requireFocusWidget(db, email);
  const window = await loadWindow(db);
  const endsAt = await db.runTransaction(async (tx) => {
    const fresh = readSession(await tx.get(ref));
    const now = deps.now();
    if (!isActive(fresh, now)) precondition('That session has ended.');
    const next = focusExtendEndsAt(now, fresh.endsAt, window);
    if (!next.ok)
      precondition('The session already runs to the end of the school day.');
    const value = (next as { ok: true; endsAt: number }).endsAt;
    tx.update(ref, { endsAt: value });
    return value;
  });
  await refreshFocusConflicts(db, session.studentUids, deps.now());
  return { endsAt };
}

/** Folds a running away stretch into the total. */
function settleAway(student: FocusStudentDoc, now: number) {
  return {
    awaySince: null,
    awayMs:
      student.awayMs +
      (student.awaySince !== null ? Math.max(0, now - student.awaySince) : 0),
  };
}

export async function handleFocusRelease(
  db: Firestore,
  caller: FocusCaller | null,
  data: unknown,
  deps: FocusDeps
): Promise<FocusReleaseReply> {
  const { input, ref, session } = await loadActive(db, data, deps.now());
  await authorizeTeacherOrSub(db, ref, session, caller, input.shareId, deps);
  let targets = session.studentUids;
  if (input.studentUid !== undefined && input.studentUid !== null) {
    const uid = shortId(input.studentUid, 'studentUid');
    if (!session.studentUids.includes(uid))
      bad('That student is not in this session.');
    targets = [uid];
  }
  const now = deps.now();
  const released = await patchOpenStudents(
    db,
    targets.map((uid) => ({
      ref: studentsCol(ref).doc(uid),
      patch: (cur) =>
        cur.status === 'released'
          ? null
          : {
              status: 'released',
              liveHost: null,
              otherSessionEndsAt: null,
              ...settleAway(cur, now),
            },
    }))
  );
  // A student released here may now belong to a later session (F7).
  await refreshFocusConflicts(db, released, now);
  return { released: released.length };
}

export async function handleFocusAddSite(
  db: Firestore,
  callerIn: FocusCaller | null,
  data: unknown,
  deps: FocusDeps
): Promise<FocusAddSiteReply> {
  const { caller, email } = verifyTeacher(callerIn);
  const { input, ref, session } = await loadActive(db, data, deps.now());
  if (!isFocusSite(input.site)) bad('That is not a web address.');
  const site = input.site as FocusSite;
  await authorizeSessionTeacher(db, ref, session, caller, email, deps);
  await requireFocusWidget(db, email);
  const sites = await db.runTransaction(async (tx) => {
    const fresh = readSession(await tx.get(ref));
    if (!isActive(fresh, deps.now())) precondition('That session has ended.');
    if (fresh.sites.some((s) => s.host === site.host && s.path === site.path))
      return fresh.sites;
    if (fresh.sites.length >= FOCUS_MAX_SITES)
      precondition(`A session allows at most ${FOCUS_MAX_SITES} sites.`);
    const next = [...fresh.sites, { host: site.host, path: site.path }];
    tx.update(ref, { sites: next });
    return next;
  });
  return { sites };
}

/** F11: what a student's state collapses to when the session ends. */
export function summarizeFocusStudent(
  student: Partial<FocusStudentDoc> | undefined,
  now: number,
  expiresAt: Timestamp
): FocusStudentSummary {
  const awayMs = typeof student?.awayMs === 'number' ? student.awayMs : 0;
  const awaySince =
    typeof student?.awaySince === 'number' ? student.awaySince : null;
  return {
    status: 'ended',
    awayMs: awayMs + (awaySince !== null ? Math.max(0, now - awaySince) : 0),
    blockedTries:
      typeof student?.blockedTries === 'number' ? student.blockedTries : 0,
    connected: typeof student?.lastReportAt === 'number',
    [FOCUS_TTL_FIELD]: expiresAt,
  };
}

/** Ends a session once (later calls return the first end time), then finishes the end. */
export async function endFocusSession(
  db: Firestore,
  ref: DocRef,
  reason: NonNullable<FocusSessionDoc['endReason']>,
  now: number
): Promise<number> {
  const ended = await db.runTransaction(async (tx) => {
    const fresh = readSession(await tx.get(ref));
    if (fresh.endedAt !== null)
      return { endedAt: fresh.endedAt, session: fresh };
    // Ending after time ran out records when it ran out, not when the sweep noticed.
    const endedAt = Math.min(now, fresh.endsAt);
    tx.update(ref, { endedAt, endReason: reason });
    return { endedAt, session: fresh };
  });
  await finishFocusEnd(db, ref, ended.session.studentUids, ended.endedAt, now);
  return ended.endedAt;
}

/**
 * Collapses every student doc (F11), frees students later sessions wait on (F7), and only then sets the
 * session's final expiry, which marks the end finished; safe to repeat, and the sweep repeats it until then.
 */
async function finishFocusEnd(
  db: Firestore,
  ref: DocRef,
  studentUids: readonly string[],
  endedAt: number,
  now: number
): Promise<void> {
  const expiresAt = finalExpiry(endedAt);
  const students = await studentsCol(ref).get();
  const open = students.docs.filter(
    (d) => (d.data() as { status?: unknown }).status !== 'ended'
  );
  for (const part of chunks(open, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const doc of part)
      batch.set(
        doc.ref,
        summarizeFocusStudent(doc.data() as FocusStudentDoc, endedAt, expiresAt)
      );
    await batch.commit();
  }
  await refreshFocusConflicts(db, studentUids, now);
  await ref.update({ [FOCUS_TTL_FIELD]: expiresAt });
}

function isEndFinished(session: FocusSessionDoc): boolean {
  const ttl = session[FOCUS_TTL_FIELD];
  return (
    session.endedAt !== null &&
    ttl instanceof Timestamp &&
    ttl.toMillis() === finalExpiry(session.endedAt).toMillis()
  );
}

export async function handleFocusEnd(
  db: Firestore,
  caller: FocusCaller | null,
  data: unknown,
  deps: FocusDeps
): Promise<FocusEndReply> {
  const input = (data ?? {}) as Record<string, unknown>;
  const ref = sessionsCol(db).doc(shortId(input.sessionId, 'sessionId'));
  const session = readSession(await ref.get());
  await authorizeTeacherOrSub(db, ref, session, caller, input.shareId, deps);
  const now = deps.now();
  const reason: NonNullable<FocusSessionDoc['endReason']> =
    session.endedAt === null && session.endsAt <= now ? 'time' : 'teacher';
  return { endedAt: await endFocusSession(db, ref, reason, now) };
}

/** Why a still-open session should end now, or null (F6: time ran out, or the window closed or moved). */
export function focusEndReasonAt(
  session: FocusSessionDoc,
  now: number,
  window: FocusWindow
): 'time' | 'window' | null {
  if (session.endsAt <= now) {
    // A session cut short at the window's close ended because of the window.
    return focusWindowEndsAt(session.endsAt - 1000, window) === session.endsAt
      ? 'window'
      : 'time';
  }
  return focusWindowEndsAt(now, window) === null ? 'window' : null;
}

/** The scheduled ender: closes every open session whose time or window is up. */
export async function sweepFocusSessions(
  db: Firestore,
  now: number
): Promise<{ ended: number; failed: number }> {
  const window = await loadWindow(db);
  const open = await sessionsCol(db).where('endedAt', '==', null).get();
  let ended = 0;
  let failed = 0;
  for (const doc of open.docs) {
    const reason = focusEndReasonAt(doc.data() as FocusSessionDoc, now, window);
    if (!reason) continue;
    try {
      await endFocusSession(db, doc.ref, reason, now);
      ended += 1;
    } catch (err) {
      failed += 1;
      console.error('[focusSweep] end failed', doc.id, err);
    }
  }
  const recent = await sessionsCol(db)
    .where('endedAt', '>=', now - UNFINISHED_END_LOOKBACK_MS)
    .get();
  for (const doc of recent.docs) {
    const session = doc.data() as FocusSessionDoc;
    if (isEndFinished(session)) continue;
    try {
      await finishFocusEnd(
        db,
        doc.ref,
        session.studentUids,
        session.endedAt as number,
        now
      );
    } catch (err) {
      failed += 1;
      console.error('[focusSweep] finishing end failed', doc.id, err);
    }
  }
  return { ended, failed };
}

/**
 * Finds the class's running session for a co-teacher (added to `teacherUids`, F1) or a substitute
 * (stamped as a sub monitor until their share expires, F8), so the session rules let them read it.
 */
export async function handleFocusOpen(
  db: Firestore,
  caller: FocusCaller | null,
  data: unknown,
  deps: FocusDeps
): Promise<FocusOpenReply> {
  const input = (data ?? {}) as Record<string, unknown>;
  const classId = shortId(input.classId, 'classId');
  const now = deps.now();
  const sub = input.shareId !== undefined && input.shareId !== null;
  const email = sub
    ? verifySubCaller(caller).email
    : verifyTeacher(caller).email;
  const domain = normalizeEmailDomain(email);
  const orgId = domain ? await resolveOrgIdForDomain(db, domain) : null;
  if (!orgId) denied('Your account is not part of a school on SpartBoard.');
  const lock = await classLockRef(db, orgId as string, classId).get();
  const sessionId = await runningSessionFor((r) => r.get(), db, lock, now);
  if (!sessionId) return { sessionId: null };
  const ref = sessionsCol(db).doc(sessionId);
  const session = readSession(await ref.get());
  const who = caller as FocusCaller;
  if (!sub) {
    await authorizeSessionTeacher(db, ref, session, who, email, deps);
    return { sessionId };
  }
  const { expiresAt } = await authorizeSessionSub(
    db,
    session,
    who,
    input.shareId,
    now
  );
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() ?? {};
    const raw: unknown = fresh.subMonitorUids;
    const uids = Array.isArray(raw)
      ? raw.filter((u): u is string => typeof u === 'string')
      : [];
    const until =
      typeof fresh.subMonitorUntil === 'number' ? fresh.subMonitorUntil : 0;
    tx.update(ref, {
      subMonitorUids: uids.includes(who.uid) ? uids : [...uids, who.uid],
      subMonitorUntil: Math.max(until, expiresAt),
    });
  });
  return { sessionId };
}
