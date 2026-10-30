/**
 * Quiz join-code -> session lookup.
 *
 * `quiz_join_codes/{code}` is the code's owner record (create-if-absent, so a code
 * has one owner); join resolves a code only to that owner's sessions.
 *
 * The PIN join resolves a 6-char code to a session. It used to do that with
 * `where('code','==',code)` against `quiz_sessions`, which forces that collection
 * to answer `list` to every authed caller: a list rule is evaluated against the
 * query with an empty resource and cannot prove a filter on `code` was supplied,
 * so no rule can tell the join apart from a bare enumeration of every teacher's
 * sessions. Pointer docs at `quiz_join_codes/{code}/sessions/{sessionId}` move the
 * code into the document path, where knowing it is provable by construction.
 *
 * Every join path goes through `findQuizSessionsByCode` so they resolve a code the
 * same way. See docs/plans/shipped/QUIZ_JOIN_CODE_LOOKUP.md for the rollout.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizSession } from '@/types';

export const QUIZ_JOIN_CODES_COLLECTION = 'quiz_join_codes';
const POINTERS_SUBCOLLECTION = 'sessions';
const QUIZ_SESSIONS_COLLECTION = 'quiz_sessions';

/**
 * Cap on pointers read per code — a code accumulates one per session that used
 * it, and each one costs a `get`. Sessions past the cap become unreachable BY
 * CODE once the legacy query goes away, so this is set well above the handful a
 * recycled code realistically collects rather than at the cost floor.
 */
const MAX_POINTERS_PER_CODE = 25;

export interface QuizSessionMatch {
  id: string;
  data: QuizSession;
}

/** Owner record for a code; its `teacherUid` is the only account that may use it. */
export function joinCodeOwnerRef(code: string) {
  return doc(db, QUIZ_JOIN_CODES_COLLECTION, code);
}

/** The code's owner uid, or null when nobody holds it yet. */
export async function readJoinCodeOwner(
  normCode: string
): Promise<string | null> {
  if (!normCode) return null;
  const snap = await getDoc(joinCodeOwnerRef(normCode));
  const owner: unknown = snap.exists() ? snap.data().teacherUid : null;
  return typeof owner === 'string' && owner ? owner : null;
}

/** Claim a fresh code for this teacher, in the batch that creates its session. */
export function addJoinCodeOwnerToBatch(
  batch: WriteBatch,
  code: string,
  teacherUid: string,
  createdAt: number
): void {
  if (!code) return;
  batch.set(joinCodeOwnerRef(code), { teacherUid, createdAt });
}

/** Pointer doc for one (code, session) pair. */
export function joinCodePointerRef(code: string, sessionId: string) {
  return doc(
    db,
    QUIZ_JOIN_CODES_COLLECTION,
    code,
    POINTERS_SUBCOLLECTION,
    sessionId
  );
}

/** Pointer payload — the rules allow these three keys and nothing else. */
export function joinCodePointerData(
  sessionId: string,
  teacherUid: string,
  createdAt: number
) {
  return { sessionId, teacherUid, createdAt };
}

/**
 * Register a session under its join code, in the caller's batch so the pointer
 * and the session commit together — a session whose pointer never landed would
 * be unjoinable.
 */
export function addJoinCodePointerToBatch(
  batch: WriteBatch,
  code: string,
  sessionId: string,
  teacherUid: string,
  createdAt: number
): void {
  if (!code) return;
  batch.set(
    joinCodePointerRef(code, sessionId),
    joinCodePointerData(sessionId, teacherUid, createdAt)
  );
}

/** Drop a session's pointer, in the caller's batch. */
export function deleteJoinCodePointerFromBatch(
  batch: WriteBatch,
  code: string,
  sessionId: string
): void {
  if (!code) return;
  batch.delete(joinCodePointerRef(code, sessionId));
}

/** Session ids registered under a code, newest first. */
export async function lookupSessionIdsByCode(
  normCode: string
): Promise<string[]> {
  if (!normCode) return [];
  const snap = await getDocs(
    query(
      collection(
        db,
        QUIZ_JOIN_CODES_COLLECTION,
        normCode,
        POINTERS_SUBCOLLECTION
      ),
      orderBy('createdAt', 'desc'),
      limit(MAX_POINTERS_PER_CODE)
    )
  );
  return snap.docs.map((d) => d.id);
}

async function sessionsByPointer(
  normCode: string
): Promise<QuizSessionMatch[]> {
  const ids = await lookupSessionIdsByCode(normCode);
  if (ids.length === 0) return [];
  const snaps = await Promise.all(
    ids.map((id) => getDoc(doc(db, QUIZ_SESSIONS_COLLECTION, id)))
  );
  // A pointer can outlive its session (deletes are best-effort); skip the gap.
  return snaps
    .filter((s) => s.exists())
    .map((s) => ({ id: s.id, data: s.data() as QuizSession }));
}

/**
 * Every session the code's owner holds under this code. A code can carry more than
 * one of that teacher's sessions (an ended one plus a live one), so callers pick.
 * Pointers written by anyone else are ignored, so a colliding session never wins.
 *
 * `normCode` must already be through `normalizeQuizCode`. A `teacherUid` that is not
 * the code's owner (a Schoology link names the teacher who added it) matches nothing.
 */
export async function findQuizSessionsByCode(
  normCode: string,
  teacherUid?: string
): Promise<QuizSessionMatch[]> {
  if (!normCode) return [];
  const [owner, matches] = await Promise.all([
    readJoinCodeOwner(normCode),
    sessionsByPointer(normCode),
  ]);
  // An unowned code predates owner records (the backfill claims those).
  const ownerUid = owner ?? teacherUid;
  if (owner && teacherUid && teacherUid !== owner) return [];
  return ownerUid
    ? matches.filter((m) => m.data.teacherUid === ownerUid)
    : matches;
}
