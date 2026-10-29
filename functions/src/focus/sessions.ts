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
): Promise<void> {
  const { email } = verifySubCaller(caller);
  const shareId = shortId(shareIdInput, 'shareId');
  const { share, hostUid } = await verifySubShare(db, shareId, email, now);
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
  const writes: Array<[DocRef, Partial<FocusStudentDoc>]> = [];
  // `pairs` keeps each student's sessions in start order, so the first unreleased one holds them.
  pairs.forEach((pair, i) => {
    const student = snaps[i].data() as FocusStudentDoc | undefined;
    if (!student || student.status === 'released') return;
    const holder = holders.get(pair.uid);
    if (!holder) {
      holders.set(pair.uid, pair.session);
      if (student.status === 'other-session')
        writes.push([
          pair.ref,
          { status: 'waiting', otherSessionEndsAt: null },
        ]);
      return;
    }
    if (
      student.status === 'other-session' &&
      student.otherSessionEndsAt === holder.endsAt
    )
      return;
    writes.push([
      pair.ref,
      {
        status: 'other-session',
        otherSessionEndsAt: holder.endsAt,
        liveHost: null,
        ...settleAway(student, now),
      },
    ]);
  });
  for (const part of chunks(writes, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const [ref, data] of part) batch.update(ref, data);
    await batch.commit();
  }
}

const freshStudent = (): FocusStudentDoc => ({
  status: 'waiting',
  awaySince: null,
  awayMs: 0,
  blockedTries: 0,
  lastReportAt: null,
  protocol: null,
  liveHost: null,
  otherSessionEndsAt: null,
});

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

  if (!(await canUseFocusWidget(db, email)))
    denied('Focus sessions are not turned on for your account.');

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

  const running = await sessionsCol(db)
    .where('classId', '==', classId)
    .where('endedAt', '==', null)
    .get();
  if (
    running.docs.some(
      (d) =>
        (d.data() as FocusSessionDoc).orgId === orgId &&
        isActive(d.data() as FocusSessionDoc, now)
    )
  ) {
    precondition('That class already has a focus session running.');
  }

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
  };
  // Students first, so a status check that finds the session also finds their doc.
  for (const part of chunks(studentUids, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const uid of part)
      batch.set(studentsCol(ref).doc(uid), freshStudent());
    await batch.commit();
  }
  await ref.set(session);
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
  const snaps = await Promise.all(
    targets.map((uid) => studentsCol(ref).doc(uid).get())
  );
  const pending = snaps.filter(
    (s) => s.exists && (s.data() as FocusStudentDoc).status !== 'released'
  );
  for (const part of chunks(pending, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const snap of part) {
      batch.update(snap.ref, {
        status: 'released',
        liveHost: null,
        otherSessionEndsAt: null,
        ...settleAway(snap.data() as FocusStudentDoc, now),
      });
    }
    await batch.commit();
  }
  // A student released here may now belong to a later session (F7).
  await refreshFocusConflicts(
    db,
    pending.map((s) => s.id),
    now
  );
  return { released: pending.length };
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

/** Ends a session once (later calls return the first end time), collapses every student doc and frees students other sessions wait on. */
export async function endFocusSession(
  db: Firestore,
  ref: DocRef,
  reason: NonNullable<FocusSessionDoc['endReason']>,
  now: number
): Promise<number> {
  const expiresAt = Timestamp.fromMillis(now + FOCUS_RETENTION_DAYS * DAY_MS);
  const ended = await db.runTransaction(async (tx) => {
    const fresh = readSession(await tx.get(ref));
    if (fresh.endedAt !== null)
      return { endedAt: fresh.endedAt, first: false, session: fresh };
    // Ending after time ran out records when it ran out, not when the sweep noticed.
    const endedAt = Math.min(now, fresh.endsAt);
    tx.update(ref, {
      endedAt,
      endReason: reason,
      [FOCUS_TTL_FIELD]: expiresAt,
    });
    return { endedAt, first: true, session: fresh };
  });
  // Re-collapse even on a repeat call, so an end that died mid-collapse is finished by the next one.
  const students = await studentsCol(ref).get();
  const open = students.docs.filter(
    (d) => (d.data() as { status?: unknown }).status !== 'ended'
  );
  for (const part of chunks(open, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const doc of part)
      batch.set(
        doc.ref,
        summarizeFocusStudent(
          doc.data() as FocusStudentDoc,
          ended.endedAt,
          expiresAt
        )
      );
    await batch.commit();
  }
  if (ended.first)
    await refreshFocusConflicts(db, ended.session.studentUids, now);
  return ended.endedAt;
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
  return { ended, failed };
}
