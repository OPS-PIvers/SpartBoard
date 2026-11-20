// Writing peer review: the teacher pairs students, and a partner reads, comments on or suggests edits to the writing.
import { randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import axios from 'axios';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS, computeStudentUid } from './classlinkShared';
import { assertViewAsAllowed } from './viewAsGuard';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
} from './secrets';
import { loadTargetDirectory } from './studentTargetDirectory';
import {
  WRITING_RESPONSES,
  WRITING_SESSIONS,
  loadStudentAccess,
  writingCallerFrom,
  type WritingCaller,
} from './writingResponses';

type Data = Record<string, unknown>;

export const PEER_LINKS = 'peer_links';
export const PEER_MARKS = 'peer';
export const PEER_ACCESS = ['view', 'comment', 'edit'] as const;
export type PeerAccess = (typeof PEER_ACCESS)[number];

const GROUP_MAX = 3;
const GROUPS_MAX = 200;
const QUOTE_MAX = 2_000;
const BODY_MAX = 2_000;
/** A partner's open comments and edits on one piece. */
const OPEN_MARKS_MAX = 100;

export interface PeerName {
  givenName: string;
  familyName: string;
}

/** The teacher's students by uid with their names; names are never stored. */
export type PeerNameResolver = (
  teacherUid: string
) => Promise<Map<string, PeerName>>;

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v);

const isDocumentId = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 1500 &&
  !v.includes('/') &&
  v !== '.' &&
  v !== '..' &&
  !/^__.*__$/.test(v);

function sessionIdOf(data: unknown): string {
  const id = (data as Data | null)?.sessionId;
  if (!isDocumentId(id))
    throw new HttpsError('invalid-argument', 'sessionId is required.');
  return id;
}

const sessionRef = (db: Firestore, sid: string) =>
  db.collection(WRITING_SESSIONS).doc(sid);
const squash = (t: string) => t.replace(/\s+/g, ' ').trim();

/** Whether `quote` appears in the writing, comparing text with tags dropped and spacing collapsed. */
export function quoteInWriting(html: string, quote: string): boolean {
  const text = html
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  const q = squash(quote);
  return q.length > 0 && squash(text).includes(q);
}

const linkRef = (db: Firestore, sid: string, uid: string) =>
  sessionRef(db, sid).collection(PEER_LINKS).doc(uid);
const marksCol = (db: Firestore, sid: string, authorUid: string) =>
  sessionRef(db, sid)
    .collection(WRITING_RESPONSES)
    .doc(authorUid)
    .collection(PEER_MARKS);
const recordRef = (db: Firestore, teacherUid: string, sid: string) =>
  db
    .collection('users')
    .doc(teacherUid)
    .collection('writing_assignment_records')
    .doc(sid);

/** "Last, First", or the first name alone when there is no last name (test classes). */
export const displayName = (n: PeerName | undefined): string =>
  !n
    ? ''
    : n.familyName && n.givenName
      ? `${n.familyName}, ${n.givenName}`
      : n.familyName || n.givenName;

/** Each student in a group reviews the next one; a pair reviews each other. */
export function peerEdges(
  groups: readonly string[][]
): { reviewer: string; author: string }[] {
  return groups.flatMap((g) =>
    g.map((reviewer, i) => ({ reviewer, author: g[(i + 1) % g.length] }))
  );
}

/** Validates the teacher's groups: two or three distinct students each, nobody twice. */
export function parseGroups(raw: unknown): string[][] {
  if (!Array.isArray(raw) || raw.length > GROUPS_MAX)
    throw new HttpsError('invalid-argument', 'groups is invalid.');
  const seen = new Set<string>();
  return raw.map((g) => {
    if (!Array.isArray(g) || g.length < 2 || g.length > GROUP_MAX)
      throw new HttpsError('invalid-argument', 'Each group needs 2 or 3.');
    return g.map((uid) => {
      if (!isDocumentId(uid) || seen.has(uid))
        throw new HttpsError('invalid-argument', 'groups is invalid.');
      seen.add(uid);
      return uid;
    });
  });
}

const runningReview = (session: Data): { access: PeerAccess } | null => {
  const pr = session.peerReview as Data | null | undefined;
  if (!pr || isNum(pr.endedAt) || session.status !== 'active') return null;
  return PEER_ACCESS.includes(pr.access as PeerAccess)
    ? { access: pr.access as PeerAccess }
    : null;
};

async function teacherSession(
  db: Firestore,
  caller: WritingCaller | null,
  sid: string
): Promise<Data> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (caller.student)
    throw new HttpsError('permission-denied', 'Teacher sign-in required.');
  const snap = await sessionRef(db, sid).get();
  const session: Data = snap.exists ? (snap.data() ?? {}) : {};
  if (!snap.exists || session.teacherUid !== caller.uid)
    throw new HttpsError('permission-denied', 'Not your assignment.');
  return session;
}

// ── setWritingPeerReviewV1 (teacher) ─────────────────────────────────────────

export async function handleSetPeerReview(
  db: Firestore,
  caller: WritingCaller | null,
  data: unknown,
  now: number,
  resolveNames: PeerNameResolver
): Promise<{ ok: true }> {
  const sid = sessionIdOf(data);
  const session = await teacherSession(db, caller, sid);
  const teacherUid = caller!.uid;
  const d = (data ?? {}) as Data;
  // Every link on the session, not only the record's, so an overlapping save leaves none behind.
  const prevMembers = new Set(
    (await sessionRef(db, sid).collection(PEER_LINKS).get()).docs.map(
      (doc) => doc.id
    )
  );
  const prev = (session.peerReview ?? null) as Data | null;
  const batch = db.batch();

  if (d.end === true) {
    for (const uid of prevMembers) batch.delete(linkRef(db, sid, uid));
    if (prev)
      batch.update(sessionRef(db, sid), {
        peerReview: { ...prev, endedAt: now },
        updatedAt: now,
      });
    await batch.commit();
    return { ok: true };
  }

  if (session.status !== 'active')
    throw new HttpsError('failed-precondition', 'This assignment has ended.');
  if (!PEER_ACCESS.includes(d.access as PeerAccess))
    throw new HttpsError('invalid-argument', 'access is invalid.');
  const groups = parseGroups(d.groups);
  if (groups.length === 0)
    throw new HttpsError('invalid-argument', 'Pair at least two students.');
  const roster = await resolveNames(teacherUid);
  if (groups.some((g) => g.some((uid) => !roster.has(uid))))
    throw new HttpsError(
      'invalid-argument',
      'Pair only students in your classes.',
      { reason: 'not-in-class' }
    );

  const reviewedBy = new Map<string, string[]>();
  const reviews = new Map<string, string>();
  for (const e of peerEdges(groups)) {
    reviews.set(e.reviewer, e.author);
    reviewedBy.set(e.author, [...(reviewedBy.get(e.author) ?? []), e.reviewer]);
  }
  const members = new Set(groups.flat());
  for (const uid of members)
    batch.set(linkRef(db, sid, uid), {
      reviews: reviews.get(uid) ?? null,
      reviewedBy: reviewedBy.get(uid) ?? [],
      updatedAt: now,
    });
  for (const uid of prevMembers)
    if (!members.has(uid)) batch.delete(linkRef(db, sid, uid));
  const running = prev && !isNum(prev.endedAt);
  batch.update(sessionRef(db, sid), {
    peerReview: {
      access: d.access,
      startedAt: running && isNum(prev.startedAt) ? prev.startedAt : now,
      endedAt: null,
    },
    updatedAt: now,
  });
  batch.set(
    recordRef(db, teacherUid, sid),
    { peerGroups: groups.map((m) => ({ members: m })), updatedAt: now },
    { merge: true }
  );
  await batch.commit();
  return { ok: true };
}

// ── writingPeerReviewV1 (student) ────────────────────────────────────────────

export interface PeerInfo {
  running: boolean;
  access?: PeerAccess;
  /** The writing this student reads. */
  reviews?: { uid: string; name: string } | null;
  /** Who reads this student's writing. */
  reviewedBy?: { uid: string; name: string }[];
}

export interface PeerMarkOut {
  id: string;
  kind: 'comment' | 'edit';
  start: number;
  end: number;
  quote: string;
  insert?: string;
  body?: string;
  status: string;
  createdAt: number;
}

export interface PeerRead {
  /** The partner's draft HTML; the client sanitizes it before rendering. */
  html: string;
  started: boolean;
  marks: PeerMarkOut[];
}

const markOut = (id: string, m: Data): PeerMarkOut => ({
  id,
  kind: m.kind === 'edit' ? 'edit' : 'comment',
  start: isInt(m.start) ? m.start : 0,
  end: isInt(m.end) ? m.end : 0,
  quote: typeof m.quote === 'string' ? m.quote : '',
  ...(typeof m.insert === 'string' ? { insert: m.insert } : {}),
  ...(typeof m.body === 'string' ? { body: m.body } : {}),
  status: typeof m.status === 'string' ? m.status : 'open',
  createdAt: isNum(m.createdAt) ? m.createdAt : 0,
});

async function myMarks(
  db: Firestore,
  sid: string,
  author: string,
  me: string
): Promise<PeerMarkOut[]> {
  const snap = await marksCol(db, sid, author).where('by', '==', me).get();
  return snap.docs
    .map((doc) => markOut(doc.id, doc.data()))
    .sort((a, b) => a.createdAt - b.createdAt);
}

function parseMark(
  d: Data,
  access: PeerAccess
): Omit<PeerMarkOut, 'id' | 'status' | 'createdAt'> {
  const kind = d.kind;
  if (kind !== 'comment' && kind !== 'edit')
    throw new HttpsError('invalid-argument', 'kind is invalid.');
  if (access === 'view' || (kind === 'edit' && access !== 'edit'))
    throw new HttpsError('permission-denied', 'Not allowed at this access.', {
      reason: 'access',
    });
  const { start, end, quote } = d;
  if (!isInt(start) || !isInt(end) || start < 0 || end < start)
    throw new HttpsError('invalid-argument', 'The range is invalid.');
  if (
    typeof quote !== 'string' ||
    quote.length === 0 ||
    quote.length > QUOTE_MAX ||
    quote.length !== end - start
  )
    throw new HttpsError('invalid-argument', 'The quote is invalid.');
  if (kind === 'comment') {
    const body = typeof d.body === 'string' ? d.body.trim() : '';
    if (!body || body.length > BODY_MAX)
      throw new HttpsError('invalid-argument', 'The comment is invalid.');
    return { kind, start, end, quote, body };
  }
  const insert = typeof d.insert === 'string' ? d.insert : null;
  if (insert === null || insert.length > QUOTE_MAX || insert === quote)
    throw new HttpsError('invalid-argument', 'The edit is invalid.');
  return { kind, start, end, quote, insert };
}

export async function handlePeerReview(
  db: Firestore,
  caller: WritingCaller | null,
  data: unknown,
  now: number,
  resolveNames: PeerNameResolver
): Promise<PeerInfo | PeerRead | { id: string } | { ok: true }> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!caller.student)
    throw new HttpsError('permission-denied', 'Student sign-in required.');
  const sid = sessionIdOf(data);
  const d = (data ?? {}) as Data;
  const { session } = await loadStudentAccess(db, caller, sid);
  const review = runningReview(session);
  const linkSnap = await linkRef(db, sid, caller.uid).get();
  const link: Data = linkSnap.exists ? (linkSnap.data() ?? {}) : {};
  const author =
    typeof link.reviews === 'string' && link.reviews !== caller.uid
      ? link.reviews
      : null;
  const readers = Array.isArray(link.reviewedBy)
    ? link.reviewedBy.filter((u): u is string => typeof u === 'string')
    : [];

  if (d.action === 'info') {
    if (!review || !linkSnap.exists) return { running: false };
    const names = await resolveNames(String(session.teacherUid));
    return {
      running: true,
      access: review.access,
      reviews: author
        ? { uid: author, name: displayName(names.get(author)) }
        : null,
      reviewedBy: readers.map((uid) => ({
        uid,
        name: displayName(names.get(uid)),
      })),
    };
  }

  if (!review || !author)
    throw new HttpsError('failed-precondition', 'Peer review is not open.', {
      reason: 'closed',
    });

  if (d.action === 'read') {
    const resp = await sessionRef(db, sid)
      .collection(WRITING_RESPONSES)
      .doc(author)
      .get();
    const html: unknown = resp.exists ? resp.get('html') : '';
    return {
      html: typeof html === 'string' ? html : '',
      started: resp.exists,
      marks: await myMarks(db, sid, author, caller.uid),
    };
  }

  if (d.action === 'add') {
    const mark = parseMark(d, review.access);
    const resp = await sessionRef(db, sid)
      .collection(WRITING_RESPONSES)
      .doc(author)
      .get();
    if (!resp.exists)
      throw new HttpsError('failed-precondition', 'Nothing written yet.');
    const html: unknown = resp.get('html');
    if (!quoteInWriting(typeof html === 'string' ? html : '', mark.quote))
      throw new HttpsError(
        'invalid-argument',
        'The quote is not in the writing.',
        {
          reason: 'quote',
        }
      );
    const open = (await myMarks(db, sid, author, caller.uid)).filter(
      (m) => m.status === 'open'
    );
    if (open.length >= OPEN_MARKS_MAX)
      throw new HttpsError('resource-exhausted', 'Too many open comments.');
    const id = randomUUID();
    await marksCol(db, sid, author)
      .doc(id)
      .set({ ...mark, id, by: caller.uid, status: 'open', createdAt: now });
    return { id };
  }

  if (d.action === 'delete') {
    if (!isDocumentId(d.markId))
      throw new HttpsError('invalid-argument', 'markId is required.');
    const ref = marksCol(db, sid, author).doc(d.markId);
    const snap = await ref.get();
    if (
      !snap.exists ||
      snap.get('by') !== caller.uid ||
      snap.get('status') !== 'open'
    )
      throw new HttpsError('failed-precondition', 'This can no longer change.');
    await ref.delete();
    return { ok: true };
  }

  throw new HttpsError('invalid-argument', 'action is invalid.');
}

// ── names ────────────────────────────────────────────────────────────────────

const NAMES_TTL_MS = 10 * 60_000;
const namesCache = new Map<
  string,
  { at: number; names: Promise<Map<string, PeerName>> }
>();

/** The teacher's ClassLink and test-class students, by uid; held in memory a few minutes, never stored. */
export const resolveTeacherStudents: PeerNameResolver = (teacherUid) => {
  const hit = namesCache.get(teacherUid);
  if (hit && Date.now() - hit.at < NAMES_TTL_MS) return hit.names;
  const names = (async () => {
    const user = await admin.auth().getUser(teacherUid);
    const email = user.email;
    if (!email) return new Map<string, PeerName>();
    const hmac = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    const dir = await loadTargetDirectory(
      admin.firestore(),
      teacherUid,
      email,
      {
        classlinkClientId: CLASSLINK_CLIENT_ID.value(),
        classlinkClientSecret: CLASSLINK_CLIENT_SECRET.value(),
        tenantUrl: CLASSLINK_TENANT_URL.value(),
      },
      (err) => {
        console.error(
          '[writingPeerReview] ClassLink request failed:',
          axios.isAxiosError(err) ? err.response?.status : 'unexpected'
        );
        throw new HttpsError('internal', 'Roster service unavailable.');
      }
    );
    const out = new Map<string, PeerName>();
    const blank = { givenName: '', familyName: '' };
    for (const sourcedId of dir.ctx.classIdBySourcedId.keys())
      out.set(
        computeStudentUid(sourcedId, hmac),
        dir.namesByRefKey.get(`classlink:${sourcedId}`) ?? blank
      );
    if (dir.ctx.testClassAuthorized)
      for (const email of dir.ctx.classIdByTestEmail.keys())
        out.set(
          computeStudentUid(`test:${email}`, hmac),
          dir.namesByRefKey.get(`test:${email}`) ?? blank
        );
    return out;
  })();
  namesCache.set(teacherUid, { at: Date.now(), names });
  names.catch(() => namesCache.delete(teacherUid));
  return names;
};

// ── callables ────────────────────────────────────────────────────────────────

const OPTIONS = {
  memory: '256MiB' as const,
  timeoutSeconds: 30,
  cors: ALLOWED_ORIGINS,
  invoker: 'public' as const,
  secrets: [
    CLASSLINK_CLIENT_ID,
    CLASSLINK_CLIENT_SECRET,
    CLASSLINK_TENANT_URL,
    STUDENT_PSEUDONYM_HMAC_SECRET,
  ],
};

export const setWritingPeerReviewV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request, { outward: true });
  return handleSetPeerReview(
    admin.firestore(),
    writingCallerFrom(request.auth),
    request.data,
    Date.now(),
    resolveTeacherStudents
  );
});

export const writingPeerReviewV1 = onCall(OPTIONS, async (request) => {
  await assertViewAsAllowed(request);
  return handlePeerReview(
    admin.firestore(),
    writingCallerFrom(request.auth),
    request.data,
    Date.now(),
    resolveTeacherStudents
  );
});
