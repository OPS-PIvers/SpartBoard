// Poll join codes resolve here, under per-caller and global miss caps, so the short code space can't be swept.
import { createHmac, randomBytes, randomInt } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isTeacherShapedToken, type AiCallerToken } from './aiCallerGate';
import { OPERATOR_ORG_ID } from './authz';
import { isStaffMemberData } from './districtStaff';
import { assertViewAsAllowed } from './viewAsGuard';
import { pointerMembers } from './pollCodeMembers';

type Firestore = admin.firestore.Firestore;
type DocRef = admin.firestore.DocumentReference;

const LIMITS = 'poll_code_limits';
const JOINS = 'poll_joins';
const MINUTE_MS = 60 * 1000;
export const CALLER_WINDOW_MS = 60 * MINUTE_MS;
export const GLOBAL_WINDOW_MS = 10 * MINUTE_MS;
const JOIN_TTL_MS = 7 * 24 * 60 * MINUTE_MS;
export const POLL_CODE_CALLER_MAX_MISSES = 10;
export const POLL_CODE_GLOBAL_MAX_MISSES = 100;
// Mirrors utils/pollCode.ts.
const ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';
const CODE_LENGTH = 5;
const MINT_TRIES = 5;

/** Same canonical form as the client's normalizePollCode, or '' when it can't be a code. */
export function normalizePollCodeInput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const code = raw
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  return /^[A-Z0-9]{1,16}$/.test(code) ? code : '';
}

/** The `poll_joins` doc id that lets `uid` read session `sessionId`. */
export const pollJoinId = (sessionId: string, uid: string): string =>
  `${sessionId}__${uid}`;

const expireAt = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);

/** Records one new missed code on the caller's and the global counters. */
export type RecordMiss = (
  caller: DocRef,
  global: DocRef,
  code: string,
  now: number
) => Promise<void>;

const recordMissWithIncrements: RecordMiss = async (
  caller,
  global,
  code,
  now
) => {
  const fv = admin.firestore.FieldValue;
  await Promise.all([
    caller.set(
      {
        codes: fv.arrayUnion(code),
        expireAt: expireAt(now + 2 * CALLER_WINDOW_MS),
      },
      { merge: true }
    ),
    global.set(
      {
        misses: fv.increment(1),
        expireAt: expireAt(now + 2 * GLOBAL_WINDOW_MS),
      },
      { merge: true }
    ),
  ]);
};

let warnedGlobalBucket = -1;

/** The session a code opened and the caller's voter id in it, which keys their votes instead of their uid. */
export interface PollJoin {
  sessionId: string;
  voterId: string;
}

const SALTS = 'poll_voter_salts';

/** Records `uid`'s join; the voter id comes from a per-session salt, so it survives the join expiring. */
async function recordJoin(
  db: Firestore,
  sessionId: string,
  uid: string,
  now: number
): Promise<string> {
  const ref = db.collection(JOINS).doc(pollJoinId(sessionId, uid));
  const saltRef = db.collection(SALTS).doc(sessionId);
  let held: unknown = (await saltRef.get()).data()?.salt;
  if (typeof held !== 'string' || !held) {
    // Created once outside any transaction, so a class joining at once doesn't contend on it.
    try {
      await saltRef.create({
        salt: randomBytes(16).toString('hex'),
        createdAt: now,
      });
    } catch {
      // Another join created it first.
    }
    held = (await saltRef.get()).data()?.salt;
  }
  if (typeof held !== 'string' || !held) throw new Error('No voter salt.');
  const voterId = createHmac('sha256', held)
    .update(uid)
    .digest('hex')
    .slice(0, 20);
  await ref.set({
    sessionId,
    uid,
    voterId,
    joinedAt: now,
    expireAt: expireAt(now + JOIN_TTL_MS),
  });
  return voterId;
}

/** The session a code opens for `uid` (recording the join), or null on a miss; throws resource-exhausted when capped. */
export async function resolvePollCode(
  db: Firestore,
  uid: string,
  code: string,
  now: number = Date.now(),
  recordMiss: RecordMiss = recordMissWithIncrements
): Promise<PollJoin | null> {
  if (!code) return null;
  const globalBucket = Math.floor(now / GLOBAL_WINDOW_MS);
  const callerRef = db
    .collection(LIMITS)
    .doc(`uid__${uid}__${Math.floor(now / CALLER_WINDOW_MS)}`);
  const globalRef = db.collection(LIMITS).doc(`global__${globalBucket}`);
  const [callerSnap, globalSnap] = await Promise.all([
    callerRef.get(),
    globalRef.get(),
  ]);
  const rawCodes: unknown = callerSnap.data()?.codes;
  const codes = Array.isArray(rawCodes)
    ? rawCodes.filter((c): c is string => typeof c === 'string')
    : [];
  const repeat = codes.includes(code);
  if (!repeat && codes.length >= POLL_CODE_CALLER_MAX_MISSES) {
    throw new HttpsError('resource-exhausted', 'Too many poll code lookups.');
  }
  const globalMisses: unknown = globalSnap.data()?.misses;
  // The shared count only warns for now; it never stops a lookup.
  if (
    typeof globalMisses === 'number' &&
    globalMisses >= POLL_CODE_GLOBAL_MAX_MISSES &&
    warnedGlobalBucket !== globalBucket
  ) {
    warnedGlobalBucket = globalBucket;
    logger.warn('[resolvePollCodeV1] global miss count over threshold', {
      misses: globalMisses,
    });
  }
  const pointer = await db.collection('poll_codes').doc(code).get();
  const sessionId: unknown = pointer.data()?.sessionId;
  if (typeof sessionId !== 'string' || !sessionId) {
    if (!repeat) {
      try {
        await recordMiss(callerRef, globalRef, code, now);
      } catch (err) {
        logger.warn('[resolvePollCodeV1] miss counter write failed', err);
      }
    }
    return null;
  }
  const session = await db.collection('poll_sessions').doc(sessionId).get();
  if (!session.exists) return null;
  // The join is what lets this device read the session and vote, so a failed write fails the call.
  try {
    return { sessionId, voterId: await recordJoin(db, sessionId, uid, now) };
  } catch (err) {
    logger.warn('[resolvePollCodeV1] join write failed', err);
    throw new HttpsError('unavailable', 'Could not join the poll.');
  }
}

export const POLL_CODE_MINT_MAX_PER_HOUR = 30;
// A reservation whose session never appeared frees up after this long.
export const RESERVATION_TTL_MS = 15 * MINUTE_MS;

/** Reserve a random free code for `teacherUid`, pointing it at their session id as pollCodePointer would. */
export async function mintPollCode(
  db: Firestore,
  teacherUid: string,
  now: number = Date.now(),
  pick: () => number = () => randomInt(ALPHABET.length)
): Promise<string> {
  const capRef = db
    .collection(LIMITS)
    .doc(`mint__${teacherUid}__${Math.floor(now / CALLER_WINDOW_MS)}`);
  const minted: unknown = (await capRef.get()).data()?.count;
  if (typeof minted === 'number' && minted >= POLL_CODE_MINT_MAX_PER_HOUR) {
    throw new HttpsError('resource-exhausted', 'Too many poll codes minted.');
  }
  try {
    await capRef.set(
      {
        count: admin.firestore.FieldValue.increment(1),
        expireAt: expireAt(now + 2 * CALLER_WINDOW_MS),
      },
      { merge: true }
    );
  } catch (err) {
    logger.warn('[mintPollCodeV1] mint counter write failed', err);
  }
  for (let attempt = 0; attempt < MINT_TRIES; attempt += 1) {
    let code = '';
    while (code.length < CODE_LENGTH) code += ALPHABET[pick()];
    const ref = db.collection('poll_codes').doc(code);
    const reserved = await db.runTransaction(async (tx) => {
      const pointer = await tx.get(ref);
      if (pointer.exists) {
        const data = pointer.data() ?? {};
        const sid: unknown = data.sessionId;
        const at: unknown = data.reservedAt ?? data.updatedAt;
        const stale = typeof at === 'number' && now - at > RESERVATION_TTL_MS;
        if (!stale || typeof sid !== 'string' || !sid) return false;
        if ((await tx.get(db.collection('poll_sessions').doc(sid))).exists) {
          return false;
        }
      }
      tx.set(ref, {
        sessionId: `${teacherUid}_${code}`,
        teacherUid,
        updatedAt: now,
        reservedAt: now,
      });
      return true;
    });
    if (reserved) return code;
  }
  throw new HttpsError(
    'resource-exhausted',
    'Could not generate a unique poll join code.'
  );
}

export const resolvePollCodeV1 = onCall(
  {
    memory: '256MiB',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
    maxInstances: 5,
  },
  async (request) => {
    await assertViewAsAllowed(request);
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const data = (request.data ?? {}) as { code?: unknown };
    const join = await resolvePollCode(
      admin.firestore(),
      request.auth.uid,
      normalizePollCodeInput(data.code)
    );
    return {
      sessionId: join?.sessionId ?? null,
      voterId: join?.voterId ?? null,
    };
  }
);

/** Mirrors the poll_sessions rule: an active, non-student operator-org member doc, or an admin. */
export async function isPollStaffCaller(
  db: Firestore,
  token: AiCallerToken
): Promise<boolean> {
  if (!isTeacherShapedToken(token)) return false;
  const email = (token.email as string).toLowerCase();
  const [member, adminDoc] = await Promise.all([
    db.doc(`organizations/${OPERATOR_ORG_ID}/members/${email}`).get(),
    db.doc(`admins/${email}`).get(),
  ]);
  return isStaffMemberData(member.data()) || adminDoc.exists;
}

export const mintPollCodeV1 = onCall(
  {
    memory: '256MiB',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
    maxInstances: 5,
  },
  async (request) => {
    await assertViewAsAllowed(request);
    if (
      !request.auth ||
      !(await isPollStaffCaller(admin.firestore(), request.auth.token))
    ) {
      throw new HttpsError('permission-denied', 'Teacher sign-in required.');
    }
    return { code: await mintPollCode(admin.firestore(), request.auth.uid) };
  }
);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

type BoardRole = 'host' | 'collaborator' | 'viewer' | null;

/** `uid`'s role on a shared board, through the share itself or the linked collection it belongs to. */
function boardRole(
  share: Record<string, unknown>,
  link: Record<string, unknown> | null,
  uid: string
): BoardRole {
  if (share.originalAuthor === uid || link?.hostUid === uid) return 'host';
  const roles = [share.participants, link?.participants].map((p) =>
    isRecord(p) && isRecord(p[uid]) ? p[uid].role : undefined
  );
  if (roles.includes('collaborator')) return 'collaborator';
  return roles.some((r) => r !== undefined) ? 'viewer' : null;
}

/** The board's widgets include a poll showing this join code. */
const boardShowsCode = (share: Record<string, unknown>, code: string) =>
  Array.isArray(share.widgets) &&
  share.widgets.some(
    (w: unknown) =>
      isRecord(w) &&
      w.type === 'poll' &&
      isRecord(w.config) &&
      w.config.joinCode === code
  );

/** Lets `uid` take over `code` when both they and its holder are on the shared board that shows it. */
export async function claimPollCode(
  db: Firestore,
  uid: string,
  code: string,
  shareId: string
): Promise<boolean> {
  if (!code || !shareId || shareId.includes('/') || shareId.length > 128) {
    throw new HttpsError('invalid-argument', 'A code and board are required.');
  }
  const pointerRef = db.collection('poll_codes').doc(code);
  const shareRef = db.collection('shared_boards').doc(shareId);
  return db.runTransaction(async (tx) => {
    const [pointer, shareSnap] = await Promise.all([
      tx.get(pointerRef),
      tx.get(shareRef),
    ]);
    // No holder yet: the caller's own session write creates the pointer.
    if (!pointer.exists) return false;
    const members = pointerMembers(pointer.data());
    if (members.includes(uid)) return true;
    const share: Record<string, unknown> = shareSnap.data() ?? {};
    const mode = share.intendedMode;
    if (!shareSnap.exists || mode === 'substitute' || mode === 'copy') {
      throw new HttpsError('permission-denied', 'Not a shared board.');
    }
    const linkId = share.linkedCollectionId;
    const linkSnap =
      typeof linkId === 'string' && linkId && !linkId.includes('/')
        ? await tx.get(db.collection('linked_collections').doc(linkId))
        : null;
    const linkData = linkSnap?.data();
    // The collection counts only while it is live and lists this board.
    const link =
      linkData &&
      linkData.ended !== true &&
      Array.isArray(linkData.boards) &&
      linkData.boards.some((b: unknown) => isRecord(b) && b.shareId === shareId)
        ? linkData
        : null;
    const role = boardRole(share, link, uid);
    const holder: unknown = pointer.data()?.teacherUid;
    if (
      (role !== 'host' && role !== 'collaborator') ||
      typeof holder !== 'string' ||
      !boardShowsCode(share, code)
    ) {
      throw new HttpsError('permission-denied', 'Not on this board.');
    }
    // The share's host can list anyone as a participant, so the holder's place must be one they made.
    const holderLinked =
      share.originalAuthor === holder ||
      link?.hostUid === holder ||
      // Only a Synced collection's self-join makes a collaborator; a View-Only host can relabel viewers.
      (link?.mode === 'synced' &&
        isRecord(link.participants) &&
        isRecord(link.participants[holder]) &&
        link.participants[holder].role === 'collaborator');
    const holderBoards = holderLinked
      ? null
      : await tx.get(
          db
            .collection('users')
            .doc(holder)
            .collection('dashboards')
            .where('linkedShareId', '==', shareId)
            .limit(5)
        );
    if (
      !holderLinked &&
      // An owner is the share's host, checked above; an owner row here is stale.
      !holderBoards?.docs.some(
        (d) =>
          d.data().linkedShareRole === 'collaborator' &&
          d.data().linkedShareEnded !== true
      )
    ) {
      throw new HttpsError('permission-denied', 'Not on this board.');
    }
    tx.update(pointerRef, { memberUids: [...members, uid] });
    return true;
  });
}

export const claimPollCodeV1 = onCall(
  {
    memory: '256MiB',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
    maxInstances: 5,
  },
  async (request) => {
    await assertViewAsAllowed(request);
    if (
      !request.auth ||
      !(await isPollStaffCaller(admin.firestore(), request.auth.token))
    ) {
      throw new HttpsError('permission-denied', 'Teacher sign-in required.');
    }
    const data = (request.data ?? {}) as { code?: unknown; shareId?: unknown };
    const claimed = await claimPollCode(
      admin.firestore(),
      request.auth.uid,
      normalizePollCodeInput(data.code),
      typeof data.shareId === 'string' ? data.shareId : ''
    );
    return { claimed };
  }
);
