// Poll join codes resolve here, under per-caller and global miss caps, so the short code space can't be swept.
import { randomInt } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isTeacherShapedToken } from './aiCallerGate';

type Firestore = admin.firestore.Firestore;

const LIMITS = 'poll_code_limits';
const JOINS = 'poll_joins';
const HOUR_MS = 60 * 60 * 1000;
const JOIN_TTL_MS = 7 * 24 * HOUR_MS;
export const POLL_CODE_CALLER_MAX_MISSES = 10;
export const POLL_CODE_GLOBAL_MAX_MISSES = 600;
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

function readCodes(data: Record<string, unknown> | undefined, now: number) {
  const start = typeof data?.windowStart === 'number' ? data.windowStart : 0;
  if (!data || now - start >= HOUR_MS) return { windowStart: now, codes: [] };
  const codes = Array.isArray(data.codes)
    ? data.codes.filter((c): c is string => typeof c === 'string')
    : [];
  return { windowStart: start, codes };
}

/** The session a code opens for `uid` (recording the join), or null on a miss or a cap. */
export async function resolvePollCode(
  db: Firestore,
  uid: string,
  code: string,
  now: number = Date.now()
): Promise<string | null> {
  if (!code) return null;
  const globalRef = db
    .collection(LIMITS)
    .doc(`global__${Math.floor(now / HOUR_MS)}`);
  const globalSnap = await globalRef.get();
  const globalMisses: unknown = globalSnap.data()?.misses;
  if (
    typeof globalMisses === 'number' &&
    globalMisses >= POLL_CODE_GLOBAL_MAX_MISSES
  ) {
    return null;
  }
  const callerRef = db.collection(LIMITS).doc(`uid__${uid}`);
  const pointerRef = db.collection('poll_codes').doc(code);
  const outcome = await db.runTransaction(async (tx) => {
    const caller = readCodes((await tx.get(callerRef)).data(), now);
    const repeat = caller.codes.includes(code);
    if (!repeat && caller.codes.length >= POLL_CODE_CALLER_MAX_MISSES) {
      return { kind: 'blocked' as const };
    }
    const sessionId: unknown = (await tx.get(pointerRef)).data()?.sessionId;
    if (typeof sessionId === 'string' && sessionId) {
      return { kind: 'hit' as const, sessionId };
    }
    // A retry of the same code (the pointer lands just after Start) is free.
    if (!repeat) {
      tx.set(callerRef, {
        windowStart: caller.windowStart,
        codes: [...caller.codes, code],
        expireAt: expireAt(caller.windowStart + 2 * HOUR_MS),
      });
    }
    return { kind: repeat ? ('repeat' as const) : ('miss' as const) };
  });
  if (outcome.kind === 'miss') {
    await db.runTransaction(async (tx) => {
      const misses: unknown = (await tx.get(globalRef)).data()?.misses;
      tx.set(globalRef, {
        misses: (typeof misses === 'number' ? misses : 0) + 1,
        expireAt: expireAt(now + 2 * HOUR_MS),
      });
    });
  }
  if (outcome.kind !== 'hit') return null;
  const session = await db
    .collection('poll_sessions')
    .doc(outcome.sessionId)
    .get();
  if (!session.exists) return null;
  await db
    .collection(JOINS)
    .doc(pollJoinId(outcome.sessionId, uid))
    .set({
      sessionId: outcome.sessionId,
      uid,
      joinedAt: now,
      expireAt: expireAt(now + JOIN_TTL_MS),
    });
  return outcome.sessionId;
}

/** A random code no session points at yet; the server picks it, so minting reveals nothing. */
export async function mintPollCode(
  db: Firestore,
  pick: () => number = () => randomInt(ALPHABET.length)
): Promise<string> {
  for (let attempt = 0; attempt < MINT_TRIES; attempt += 1) {
    let code = '';
    while (code.length < CODE_LENGTH) code += ALPHABET[pick()];
    if (!(await db.collection('poll_codes').doc(code).get()).exists) {
      return code;
    }
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
    if (!request.auth || !isTeacherShapedToken(request.auth.token)) {
      throw new HttpsError('permission-denied', 'Teacher sign-in required.');
    }
    return { code: await mintPollCode(admin.firestore()) };
  }
);
