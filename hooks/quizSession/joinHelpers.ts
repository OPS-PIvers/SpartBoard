import { doc, getDoc, type DocumentSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import {
  QUIZ_SESSIONS_COLLECTION,
  RESPONSES_COLLECTION,
} from '@/hooks/quizSession/collections';

// Safe extraction of FirestoreError.code (or any error-like object's `code`
// field). Returns undefined when err isn't an object or has no string `code`,
// so callers don't blow up on non-Error throws or stringly-typed values.
export function getErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

// Phase-A diagnostic helper: when a Firestore op inside joinQuizSession
// rejects, emit a structured breadcrumb naming the op + the join's auth/PIN
// state, then re-throw. The outer catch in joinQuizSession only sees
// `err.message`, which is "Missing or insufficient permissions" verbatim —
// the breadcrumb is the only place we can correlate the denial back to which
// of the (lookup / read-existing / create / update-reset / update-period /
// update-classid) operations actually tripped, and what the request shape
// looked like at that moment.
//
// Always re-throws so callers' control flow is unchanged. Type is `never`
// so TS narrows correctly when used in `catch` blocks that don't want a
// dangling promise return path.
/** `seats/{uid}` points the content rule at the caller's response (anonymous keys aren't the uid). */
export function seatRef(sessionId: string, uid: string) {
  return doc(db, QUIZ_SESSIONS_COLLECTION, sessionId, 'seats', uid);
}

export function logQuizJoinFirestoreError(
  op: string,
  err: unknown,
  ctx: Record<string, unknown>
): never {
  const code = getErrorCode(err);
  if (code === 'permission-denied') {
    console.warn(
      `[useQuizSession] permission-denied during joinQuizSession op=${op}:`,
      { op, code, ...ctx, err }
    );
  }
  throw err;
}

/**
 * Look up the student's response doc for a session, trying the deterministic
 * key first and falling back to the legacy auth-uid key for anonymous PIN
 * joiners whose in-progress doc was written under the old keying scheme.
 * Returns the resolved key and the snapshot (existent or not) so the caller
 * can branch on `snap.exists()` without re-fetching.
 */
export async function findExistingResponseDoc(
  sessionId: string,
  authUid: string,
  isAnonymous: boolean,
  deterministicKey: string,
  // Pre-canonical key (leading zeros kept): a doc this device made before the change still resumes.
  paddedKey: string = deterministicKey
): Promise<{ key: string; snap: DocumentSnapshot | null }> {
  // Probe the deterministic key. For anonymous joiners, `permission-denied`
  // here means either no doc yet or a doc written by a different anon UID
  // (a PIN collision, or the same student on a fresh browser session): the
  // read rule denies both alike so the key can't be used to probe PINs.
  // Treat it as "no doc from here" so the caller falls through to the
  // legacy probe / create path; a create on a taken key is then denied and
  // surfaces through joinQuizSession's outer catch.
  //
  // For SSO/studentRole users, `permission-denied` is a legitimate
  // class-gate denial (and `deterministicKey === authUid`, so the legacy
  // probe wouldn't run anyway) — let it propagate so the join fails fast
  // instead of attempting a doomed write.
  let deterministicSnap: DocumentSnapshot | null = null;
  try {
    deterministicSnap = await getDoc(
      doc(
        db,
        QUIZ_SESSIONS_COLLECTION,
        sessionId,
        RESPONSES_COLLECTION,
        deterministicKey
      )
    );
  } catch (err) {
    if (!isAnonymous || getErrorCode(err) !== 'permission-denied') throw err;
  }
  if (deterministicSnap?.exists()) {
    return { key: deterministicKey, snap: deterministicSnap };
  }
  if (isAnonymous && paddedKey !== deterministicKey) {
    try {
      const paddedSnap = await getDoc(
        doc(
          db,
          QUIZ_SESSIONS_COLLECTION,
          sessionId,
          RESPONSES_COLLECTION,
          paddedKey
        )
      );
      if (paddedSnap.exists()) return { key: paddedKey, snap: paddedSnap };
    } catch (err) {
      if (getErrorCode(err) !== 'permission-denied') throw err;
    }
  }
  if (isAnonymous && deterministicKey !== authUid) {
    // Probe the legacy authUid-keyed slot. The doc, if it exists, was created
    // by a previous device/session whose anon UID is no longer ours, so its
    // `studentUid` field will not match `request.auth.uid` — and the response
    // read rule rejects with permission-denied. Treat that rejection as
    // "no legacy doc here" rather than letting it bubble out as a generic
    // joinQuizSession error toast on the student side.
    try {
      const legacySnap = await getDoc(
        doc(
          db,
          QUIZ_SESSIONS_COLLECTION,
          sessionId,
          RESPONSES_COLLECTION,
          authUid
        )
      );
      if (legacySnap.exists()) {
        return { key: authUid, snap: legacySnap };
      }
    } catch (err) {
      if (getErrorCode(err) !== 'permission-denied') throw err;
      console.warn(
        '[useQuizSession] permission-denied on legacy response probe; treating as no doc.',
        { sessionId, authUid, err }
      );
    }
  }
  return { key: deterministicKey, snap: deterministicSnap };
}

/** Asks the server to hand this PIN device a scan-first hybrid row the paper import left unowned; false when there is none. */
export async function claimScannedResponse(
  sessionId: string,
  pin: string,
  period: string | undefined,
  classId: string | null
): Promise<boolean> {
  try {
    const res = await httpsCallable<
      { sessionId: string; pin: string; period: string; classId?: string },
      { claimed: boolean; reason?: string }
    >(
      functions,
      'claimPaperResponseV1'
    )({
      sessionId,
      pin,
      period: period ?? '',
      ...(classId ? { classId } : {}),
    });
    return res.data.claimed === true;
  } catch (err) {
    console.warn('[useQuizSession] paper row claim failed:', {
      code: getErrorCode(err),
    });
    return false;
  }
}
