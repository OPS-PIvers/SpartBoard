/**
 * useSyncedQuizGroups
 *
 * Real-time bridge between the synced-quiz canonical docs at
 * `/synced_quizzes/{groupId}` and the teacher's UI. Given a (possibly
 * changing) set of group ids the local user participates in, this hook
 * keeps an in-memory `Map<groupId, SyncedQuizGroup>` populated via
 * per-doc `onSnapshot` listeners and exposes a small action API for
 * publishing edits, pulling the canonical into a local replica, and
 * joining/leaving via the matching Cloud Functions.
 *
 * Why per-doc listeners (instead of a `where(documentId(), 'in', ...)`
 * query): the `in` operator caps at 30 ids and would still need to be
 * re-issued on every list change; per-doc listeners diff naturally as
 * ids come and go, and at the realistic teacher scale (a handful of
 * synced groups per teacher) the listener count is fine.
 *
 * The publish path runs inside a Firestore transaction that asserts the
 * pre-write `version` matches the caller's expected base version and
 * increments by exactly one. The Firestore rule on `synced_quizzes`
 * mirrors the +1 invariant as defense-in-depth, so a concurrent loser
 * will retry against the new base version rather than silently
 * overwriting a peer's edit.
 */

import { useEffect, useState } from 'react';
import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import type { QuizQuestion, SyncedQuizGroup } from '../types';

const SYNCED_QUIZZES_COLLECTION = 'synced_quizzes';

export interface PublishSyncedQuizInput {
  /** Title to publish to the canonical doc. */
  title: string;
  /** Question list to publish. */
  questions: QuizQuestion[];
  /**
   * The version of the canonical doc the caller's local Drive replica is
   * based on. The transaction asserts `current.version === expectedVersion`;
   * a mismatch throws so the caller can prompt the user to pull the latest
   * from a peer before re-applying their edit.
   */
  expectedVersion: number;
  /** Auth uid of the publishing teacher. Stamped into `updatedBy`. */
  uid: string;
}

export interface PublishSyncedQuizResult {
  /** New version of the canonical doc after the increment. */
  version: number;
}

export class SyncedQuizVersionConflictError extends Error {
  readonly currentVersion: number;
  readonly expectedVersion: number;
  constructor(expectedVersion: number, currentVersion: number) {
    super(
      `Synced quiz canonical version is ${currentVersion} but caller expected ${expectedVersion}.`
    );
    this.name = 'SyncedQuizVersionConflictError';
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}

/**
 * Live-subscribe to a set of synced-group docs and keep their content
 * available as a `Map<groupId, SyncedQuizGroup>`. Pass `[]` (or
 * `undefined`) when the local user has no synced quizzes — listeners are
 * torn down and the map clears.
 */
export function useSyncedQuizGroupsByIds(
  syncGroupIds: readonly string[] | undefined
): {
  groups: Map<string, SyncedQuizGroup>;
  loading: boolean;
} {
  const [groups, setGroups] = useState<Map<string, SyncedQuizGroup>>(
    () => new Map()
  );
  const [loading, setLoading] = useState<boolean>(
    () => (syncGroupIds?.length ?? 0) > 0
  );

  // Stable identity for the id list so the effect only re-runs when the
  // SET of ids changes, not when the parent re-renders with the same
  // contents in a fresh array reference. Inside the effect we re-derive
  // the id list from `idsKey` rather than closing over the prop so the
  // effect's dependency list reflects what it actually consumes.
  const idsKey = (syncGroupIds ?? []).slice().sort().join(',');

  // Adjust state during render when the id set changes — React's
  // sanctioned alternative to calling setState synchronously inside an
  // effect body. On every transition we prune the map down to entries
  // whose ids are still in scope so a teacher who detaches from a
  // synced group doesn't keep seeing the stale entry drive UI badges
  // long after the listener was torn down. Empty → clear and exit
  // loading. Non-empty → keep matching entries, re-enter loading until
  // each new id's listener resolves.
  const [prevIdsKey, setPrevIdsKey] = useState(idsKey);
  if (prevIdsKey !== idsKey) {
    setPrevIdsKey(idsKey);
    if (idsKey === '') {
      setGroups((prev) => (prev.size === 0 ? prev : new Map()));
      setLoading(false);
    } else {
      const liveIds = new Set(idsKey.split(','));
      setGroups((prev) => {
        let mutated = false;
        const next = new Map<string, SyncedQuizGroup>();
        for (const [groupId, group] of prev) {
          if (liveIds.has(groupId)) {
            next.set(groupId, group);
          } else {
            mutated = true;
          }
        }
        if (!mutated && next.size === prev.size) return prev;
        return next;
      });
      setLoading(true);
    }
  }

  useEffect(() => {
    if (idsKey === '') return;
    const ids = idsKey.split(',');
    // Track which group ids have resolved at least one snapshot in a
    // Set rather than a decrementing counter. Firestore can deliver a
    // cached snapshot followed by a server snapshot for the same doc
    // in quick succession; a counter would decrement twice and exit
    // loading prematurely (or even underflow). The Set is naturally
    // idempotent on a doubled callback.
    const resolved = new Set<string>();
    const total = ids.length;
    const markResolved = (groupId: string) => {
      if (resolved.has(groupId)) return;
      resolved.add(groupId);
      if (resolved.size === total) setLoading(false);
    };
    const unsubs: Array<() => void> = ids.map((groupId) =>
      onSnapshot(
        doc(db, SYNCED_QUIZZES_COLLECTION, groupId),
        (snap) => {
          setGroups((prev) => {
            const next = new Map(prev);
            if (snap.exists()) {
              next.set(groupId, {
                id: groupId,
                ...(snap.data() as Omit<SyncedQuizGroup, 'id'>),
              });
            } else {
              next.delete(groupId);
            }
            return next;
          });
          markResolved(groupId);
        },
        (err) => {
          console.error(
            `[useSyncedQuizGroups] subscribe error for ${groupId}:`,
            err
          );
          markResolved(groupId);
        }
      )
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [idsKey]);

  return { groups, loading };
}

/**
 * Read the latest canonical content for a single synced group. Used by
 * the "Sync available" pull path on quiz library cards (writes the
 * returned content into the caller's Drive replica, then bumps the local
 * `lastSyncedVersion`).
 */
export async function pullSyncedQuizContent(
  groupId: string
): Promise<{ title: string; questions: QuizQuestion[]; version: number }> {
  const snap = await getDoc(doc(db, SYNCED_QUIZZES_COLLECTION, groupId));
  if (!snap.exists()) {
    throw new Error('Synced quiz group not found.');
  }
  const data = snap.data() as Pick<
    SyncedQuizGroup,
    'title' | 'questions' | 'version'
  >;
  return {
    title: data.title,
    questions: data.questions ?? [],
    version: data.version ?? 1,
  };
}

/**
 * Create the canonical doc for a brand-new synced group. Used by
 * `shareAssignment` when the source quiz has no `syncGroupId` yet — the
 * sharer is the sole initial participant.
 *
 * Returns the assigned `groupId`. The doc is written via `setDoc` (not
 * `addDoc`) so the rule's `request.resource.data.id == groupId`
 * invariant can be enforced.
 */
export async function createSyncedQuizGroup(input: {
  groupId: string;
  uid: string;
  title: string;
  questions: QuizQuestion[];
  plcId?: string;
}): Promise<void> {
  const now = Date.now();
  const payload: SyncedQuizGroup = {
    id: input.groupId,
    version: 1,
    title: input.title,
    questions: input.questions,
    participants: { [input.uid]: { joinedAt: now } },
    ...(input.plcId ? { plcId: input.plcId } : {}),
    createdAt: now,
    updatedAt: now,
    updatedBy: input.uid,
  };
  await setDoc(doc(db, SYNCED_QUIZZES_COLLECTION, input.groupId), payload);
}

/**
 * Transactionally publish a content edit to a synced group. Asserts the
 * caller's `expectedVersion` is still the canonical doc's `version`,
 * increments by 1, and stamps `updatedBy`.
 *
 * Throws `SyncedQuizVersionConflictError` if the caller's local replica
 * is behind a peer's published edit — the editor catches this and
 * prompts the teacher to pull the latest before re-applying their work.
 */
export async function publishSyncedQuiz(
  groupId: string,
  input: PublishSyncedQuizInput
): Promise<PublishSyncedQuizResult> {
  const ref = doc(db, SYNCED_QUIZZES_COLLECTION, groupId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error('Synced quiz group not found.');
    }
    const current = snap.data() as SyncedQuizGroup;
    if (current.version !== input.expectedVersion) {
      throw new SyncedQuizVersionConflictError(
        input.expectedVersion,
        current.version
      );
    }
    if (
      !current.participants ||
      !Object.prototype.hasOwnProperty.call(current.participants, input.uid)
    ) {
      // Should be impossible if the UI is wired correctly — a non-
      // participant shouldn't see the publish path — but the rule will
      // refuse the write either way; surface a friendlier error than the
      // generic Firestore permission-denied.
      throw new Error('You are not a participant of this synced group.');
    }
    const nextVersion = current.version + 1;
    const now = Date.now();
    // Note: we deliberately DO NOT touch `participants` from this client
    // path. The Firestore rule on /synced_quizzes/{groupId} requires
    // `request.resource.data.participants == resource.data.participants`
    // on update so the rule can keep the membership write-gate simple
    // (Cloud Functions are the only writer for `participants`). Any
    // per-user attribution would need to land via a server function.
    tx.update(ref, {
      version: nextVersion,
      title: input.title,
      questions: input.questions,
      updatedAt: now,
      updatedBy: input.uid,
    });
    return { version: nextVersion };
  });
}

// ---------------------------------------------------------------------------
// Cloud Function callables — thin shims so call-sites can stay on the
// hook's import surface rather than importing Firebase Functions directly.
// ---------------------------------------------------------------------------

interface JoinResponse {
  groupId: string;
  version: number;
  alreadyJoined: boolean;
}
interface LeaveResponse {
  remainingParticipants: number;
}

/**
 * Adds the caller to the synced group referenced by the given share id.
 * The Cloud Function looks up `/shared_assignments/{shareId}.syncGroupId`
 * and writes membership via the Admin SDK so client-side rules don't
 * need to allow `participants` mutations.
 */
export async function callJoinSyncedQuizGroup(
  shareId: string
): Promise<JoinResponse> {
  const fn = httpsCallable<{ shareId: string }, JoinResponse>(
    functions,
    'joinSyncedQuizGroup'
  );
  const result = await fn({ shareId });
  return result.data;
}

/**
 * Removes the caller from the synced group. Empty groups are intentionally
 * preserved — see syncedQuizGroups.ts for rationale.
 */
export async function callLeaveSyncedQuizGroup(
  groupId: string
): Promise<LeaveResponse> {
  const fn = httpsCallable<{ groupId: string }, LeaveResponse>(
    functions,
    'leaveSyncedQuizGroup'
  );
  const result = await fn({ groupId });
  return result.data;
}
