/**
 * Quiz join-code -> session lookup.
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
 * same way. See docs/plans/QUIZ_JOIN_CODE_LOOKUP.md for the rollout.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizSession } from '@/types';

export const QUIZ_JOIN_CODES_COLLECTION = 'quiz_join_codes';
const POINTERS_SUBCOLLECTION = 'sessions';
const QUIZ_SESSIONS_COLLECTION = 'quiz_sessions';

/**
 * Transitional. Sessions created before the pointer collection shipped have no
 * pointer, so their codes resolve only through the legacy query — including the
 * older sessions a student reaches from the review screen after a code was
 * recycled. Flip to false (and drop the legacy branch) once the backfill has run
 * and `quiz_sessions` list is scoped; see docs/plans/QUIZ_JOIN_CODE_LOOKUP.md.
 */
export const LEGACY_CODE_QUERY_ENABLED = true;

/** Cap on pointers read per code — a code accumulates one per session that used it. */
const MAX_POINTERS_PER_CODE = 10;

export interface QuizSessionMatch {
  id: string;
  data: QuizSession;
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

async function sessionsByLegacyQuery(
  normCode: string
): Promise<QuizSessionMatch[]> {
  const snap = await getDocs(
    query(
      collection(db, QUIZ_SESSIONS_COLLECTION),
      where('code', '==', normCode)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as QuizSession }));
}

/**
 * Every session carrying this join code. Callers pick among them — a code can
 * appear on more than one session when an old one is recycled — so this returns
 * all matches rather than guessing which one the caller wants.
 *
 * `normCode` must already be through `normalizeQuizCode`.
 */
export async function findQuizSessionsByCode(
  normCode: string
): Promise<QuizSessionMatch[]> {
  if (!normCode) return [];
  const branches = LEGACY_CODE_QUERY_ENABLED
    ? [sessionsByPointer(normCode), sessionsByLegacyQuery(normCode)]
    : [sessionsByPointer(normCode)];
  const settled = await Promise.allSettled(branches);
  // While both branches run, either one alone answers the code — a rules deploy
  // that lands before this client (or after the flag flips) must not break join.
  // Only a total failure is a real error, and it keeps the caller's error UI.
  if (settled.every((r) => r.status === 'rejected')) throw settled[0].reason;
  const byId = new Map<string, QuizSessionMatch>();
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const match of result.value) byId.set(match.id, match);
  }
  return [...byId.values()];
}
