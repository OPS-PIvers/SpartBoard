import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import './functionsInit';
import {
  ALLOWED_ORIGINS,
  encodeResponseKeySegment,
  pinIndexKey,
  quizPinKeySegment,
  retiredPinKey,
} from './classlinkShared';
import {
  pinLoginExpireAt,
  pinLoginLimited,
  pinLoginRefs,
  readPinLoginAttempts,
  readPinLoginSession,
  recordPinLoginMiss,
} from './studentIdentity';
import { assertViewAsAllowed } from './viewAsGuard';

// Same grace firestore.rules gives closeAt, endedAt and openAt.
const CLOSE_GRACE_MS = 120000;

export type ClaimPaperResponseResult =
  | { claimed: true }
  | {
      claimed: false;
      reason:
        | 'session-not-found'
        | 'not-hybrid'
        | 'closed'
        | 'not-open'
        | 'anonymous-join-disabled'
        | 'assessment'
        | 'period'
        | 'pin-login-required'
        | 'retired-pin'
        | 'not-found'
        | 'rate-limited';
    };

interface ClaimCaller {
  uid: string;
  anonymous: boolean;
}

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** A PIN device takes over a scan-first hybrid row the paper import left at its PIN key (studentUid still the key). */
export async function handleClaimPaperResponse(
  db: admin.firestore.Firestore,
  caller: ClaimCaller | null,
  raw: unknown,
  now: number = Date.now()
): Promise<ClaimPaperResponseResult> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!caller.anonymous) {
    throw new HttpsError(
      'permission-denied',
      'Only a PIN join can claim a paper row.'
    );
  }
  const data = (raw ?? {}) as Record<string, unknown>;
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
  const pin = typeof data.pin === 'string' ? data.pin.trim() : '';
  const period = typeof data.period === 'string' ? data.period : '';
  if (!sessionId || sessionId.includes('/') || !pin || pin.length > 10) {
    throw new HttpsError('invalid-argument', 'sessionId and pin are required.');
  }

  const sessionSnap = await db.collection('quiz_sessions').doc(sessionId).get();
  if (!sessionSnap.exists)
    return { claimed: false, reason: 'session-not-found' };
  const s = sessionSnap.data() ?? {};
  const teacherUid = typeof s.teacherUid === 'string' ? s.teacherUid : '';
  if (!teacherUid || strList(s.paperWrittenQuestionIds).length === 0) {
    return { claimed: false, reason: 'not-hybrid' };
  }
  if ((s.mode ?? 'submissions') !== 'submissions') {
    return { claimed: false, reason: 'not-hybrid' };
  }
  if (s.allowAnonymousJoin === false || s.audience === 'staff') {
    return { claimed: false, reason: 'anonymous-join-disabled' };
  }
  const closeAt = num(s.closeAt);
  const endedAt = num(s.endedAt) ?? 0;
  if (
    (closeAt !== null && now >= closeAt + CLOSE_GRACE_MS) ||
    (s.status === 'ended' && now >= endedAt + CLOSE_GRACE_MS)
  ) {
    return { claimed: false, reason: 'closed' };
  }
  const openAt = num(s.openAt);
  if (openAt !== null && now < openAt - CLOSE_GRACE_MS) {
    return { claimed: false, reason: 'not-open' };
  }
  // Per-period sessions refuse a self-picked PIN period in assessment mode, as the create rule does.
  if (s.periodAccess != null && s.accessMode === 'assessment') {
    return { claimed: false, reason: 'assessment' };
  }
  const periodNames = strList(s.periodNames);
  if (periodNames.length > 0 && !periodNames.includes(period)) {
    return { claimed: false, reason: 'period' };
  }
  const rosterIds = strList(s.rosterIds);
  const pinOpen = rosterIds.length === 0 || strList(s.classIds).length === 0;
  // A sign-in-length PIN on a ClassLink-rostered session goes through pinLoginV1.
  if (!pinOpen && encodeResponseKeySegment(pin).replace(/_/g, '').length >= 6) {
    return { claimed: false, reason: 'pin-login-required' };
  }
  const retired = await db
    .collection('users')
    .doc(teacherUid)
    .collection('retired_pins')
    .doc(retiredPinKey(period, pin))
    .get();
  if (retired.exists) {
    const r = retired.data() ?? {};
    if (
      strList(r.rosterIds).some((id) => rosterIds.includes(id)) ||
      (typeof r.rosterId === 'string' && rosterIds.includes(r.rosterId))
    ) {
      return { claimed: false, reason: 'retired-pin' };
    }
  }

  const responseKey = `pin-${encodeResponseKeySegment(period)}-${quizPinKeySegment(pin)}`;
  const responseRef = sessionSnap.ref.collection('responses').doc(responseKey);
  const indexKey = pinIndexKey(period, pin);
  const refs = pinLoginRefs(
    db,
    sessionId,
    caller.uid,
    indexKey,
    teacherUid,
    rosterIds
  );

  return db.runTransaction(async (tx) => {
    const [callerSnap, ...rest] = await Promise.all(
      [refs.caller, ...refs.shared, responseRef].map((r) => tx.get(r))
    );
    const responseSnap = rest[rest.length - 1];
    const row = responseSnap.exists ? (responseSnap.data() ?? {}) : null;
    // A retry after a lost reply: the row is already this caller's.
    if (row?.studentUid === caller.uid) return { claimed: true } as const;
    const a = readPinLoginAttempts(callerSnap.data(), now);
    const shared = rest
      .slice(0, -1)
      .map((snap) => readPinLoginSession(snap.data(), now));
    const limited = pinLoginLimited(a, shared, [], caller.uid, indexKey);
    const claimable =
      row !== null &&
      row.studentUid === responseKey &&
      typeof row.paperWrittenBatchId === 'string' &&
      (periodNames.length === 0 ||
        periodNames.includes(String(row.classPeriod)));
    if (!claimable) {
      recordPinLoginMiss(tx, refs, a, shared);
      return {
        claimed: false,
        reason: limited ? 'rate-limited' : 'not-found',
      } as const;
    }
    if (limited) return { claimed: false, reason: 'rate-limited' } as const;
    if (!a.indexKeys.includes(indexKey)) a.indexKeys.push(indexKey);
    tx.set(refs.caller, { ...a, expireAt: pinLoginExpireAt(a.windowStart) });
    tx.update(responseRef, { studentUid: caller.uid });
    return { claimed: true } as const;
  });
}

export const claimPaperResponseV1 = onCall(
  { memory: '256MiB', invoker: 'public', cors: ALLOWED_ORIGINS },
  async (request) => {
    await assertViewAsAllowed(request);
    const auth = request.auth;
    const caller = auth
      ? {
          uid: auth.uid,
          anonymous: auth.token.firebase?.sign_in_provider === 'anonymous',
        }
      : null;
    return handleClaimPaperResponse(admin.firestore(), caller, request.data);
  }
);
