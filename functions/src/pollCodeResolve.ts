// Poll join codes resolve here, under per-caller and global miss caps, so the short code space can't be swept.
import { randomInt } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isTeacherShapedToken } from './aiCallerGate';
import { assertViewAsAllowed } from './viewAsGuard';

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

/** The session a code opens for `uid` (recording the join), or null on a miss or a cap. */
export async function resolvePollCode(
  db: Firestore,
  uid: string,
  code: string,
  now: number = Date.now(),
  recordMiss: RecordMiss = recordMissWithIncrements
): Promise<string | null> {
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
  if (!repeat && codes.length >= POLL_CODE_CALLER_MAX_MISSES) return null;
  const globalMisses: unknown = globalSnap.data()?.misses;
  // The shared cap only stops callers already missing, so a fresh join always resolves.
  if (
    !repeat &&
    codes.length > 0 &&
    typeof globalMisses === 'number' &&
    globalMisses >= POLL_CODE_GLOBAL_MAX_MISSES
  ) {
    if (warnedGlobalBucket !== globalBucket) {
      warnedGlobalBucket = globalBucket;
      logger.warn('[resolvePollCodeV1] global miss cap reached', {
        misses: globalMisses,
      });
    }
    return null;
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
  try {
    await db
      .collection(JOINS)
      .doc(pollJoinId(sessionId, uid))
      .set({
        sessionId,
        uid,
        joinedAt: now,
        expireAt: expireAt(now + JOIN_TTL_MS),
      });
  } catch (err) {
    logger.warn('[resolvePollCodeV1] join write failed', err);
  }
  return sessionId;
}

/** Reserve a random free code for `teacherUid`, pointing it at their session id as pollCodePointer would. */
export async function mintPollCode(
  db: Firestore,
  teacherUid: string,
  now: number = Date.now(),
  pick: () => number = () => randomInt(ALPHABET.length)
): Promise<string> {
  for (let attempt = 0; attempt < MINT_TRIES; attempt += 1) {
    let code = '';
    while (code.length < CODE_LENGTH) code += ALPHABET[pick()];
    const ref = db.collection('poll_codes').doc(code);
    const reserved = await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return false;
      tx.create(ref, {
        sessionId: `${teacherUid}_${code}`,
        teacherUid,
        updatedAt: now,
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
    assertViewAsAllowed(request);
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const data = (request.data ?? {}) as { code?: unknown };
    const sessionId = await resolvePollCode(
      admin.firestore(),
      request.auth.uid,
      normalizePollCodeInput(data.code)
    );
    return { sessionId };
  }
);

export const mintPollCodeV1 = onCall(
  {
    memory: '256MiB',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
    maxInstances: 5,
  },
  async (request) => {
    assertViewAsAllowed(request);
    if (!request.auth || !isTeacherShapedToken(request.auth.token)) {
      throw new HttpsError('permission-denied', 'Teacher sign-in required.');
    }
    return { code: await mintPollCode(admin.firestore(), request.auth.uid) };
  }
);
