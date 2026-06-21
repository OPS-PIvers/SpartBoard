/**
 * usePlcComments — scoped comments + @mentions on PLC objects (Decision 2.6,
 * §3.5). Comments start on Shared Data result cards (`targetType: 'dataCard'`)
 * and the same hook serves assessments/notes later (the targetType/targetId
 * parameterization is the forward-compatible seam).
 *
 * Storage: `plcs/{plcId}/comments/{commentId}`. The hook subscribes to the
 * whole subcollection once and CLIENT-FILTERS to a single `targetType+targetId`
 * thread — this avoids a composite index and keeps a single listener even when
 * several threads render on one screen (each `ResultCard` mounts its own hook
 * but they all share Firestore's snapshot cache for the same query). Soft-
 * deleted comments (`deletedAt != null`) are filtered out of the returned list.
 *
 * Writes:
 *   - `addComment({ targetType, targetId, body, mentions })` creates a comment
 *     (serverTimestamp createdAt, authorUid/authorName from the signed-in user)
 *     and then fires the activity fan-out (Decision 2.2 + 2.6): ONE general
 *     `comment_added` event plus ONE per mentioned member uid (carrying the
 *     mention metadata) so each mentioned member's unread badge (T3) picks it
 *     up. The fan-out is fire-and-forget — it never blocks or fails the comment
 *     write.
 *   - `softDeleteComment(id)` sets `deletedAt` (any member may, per rules).
 *
 * Errors are standardized on `Error | null` (Decision 1.4).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { PlcComment } from '@/types';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';
import {
  writePlcActivityEvent,
  MENTION_ACTIVITY_TARGET_TYPE,
  COMMENT_ACTIVITY_TARGET_TYPE,
  type PlcActivityEventInput,
} from '@/utils/plcActivity';

const PLCS_COLLECTION = 'plcs';
const COMMENTS_SUBCOLLECTION = 'comments';

// The mention/comment `targetType` sentinels live in `@/utils/plcActivity` (the
// activity layer) so the feed filter + unread derivation can reference them
// without importing this hook (which would create a cycle). Re-exported here for
// back-compat with existing import sites (activityDescriptions, tests).
export {
  MENTION_ACTIVITY_TARGET_TYPE,
  COMMENT_ACTIVITY_TARGET_TYPE,
} from '@/utils/plcActivity';

export type PlcCommentTargetType = PlcComment['targetType'];

export interface AddCommentInput {
  targetType: PlcCommentTargetType;
  targetId: string;
  body: string;
  /** Member uids @mentioned in the body; each → a per-mention activity event. */
  mentions: string[];
}

interface UsePlcCommentsResult {
  /** Non-deleted comments for the scoped thread, oldest-first. */
  comments: PlcComment[];
  loading: boolean;
  error: Error | null;
  /** Create a comment + fan out activity events. Returns the new doc id. */
  addComment: (input: AddCommentInput) => Promise<string>;
  /** Soft-delete a comment (sets `deletedAt`). */
  softDeleteComment: (commentId: string) => Promise<void>;
  /**
   * Restore a soft-deleted comment by clearing `deletedAt` (Decision 3.1). Any
   * member may restore — the comments rule allows a non-author to flip
   * `deletedAt` as long as body/editedAt stay untouched.
   */
  restoreComment: (commentId: string) => Promise<void>;
}

/**
 * Parse one comment doc into a `PlcComment`, or `null` if malformed (missing a
 * required field or an out-of-union `targetType`). `mentions` is coerced to a
 * string array (non-string entries dropped). `createdAt`/`editedAt`/`deletedAt`
 * tolerate a Firestore Timestamp, legacy millis, and (for `createdAt`) an
 * unresolved pending sentinel (→ 0). Exported for unit testing.
 */
export function parseComment(
  id: string,
  data: Record<string, unknown>
): PlcComment | null {
  const targetType = data.targetType;
  if (
    targetType !== 'dataCard' &&
    targetType !== 'assessment' &&
    targetType !== 'note'
  ) {
    return null;
  }
  if (
    typeof data.targetId !== 'string' ||
    typeof data.authorUid !== 'string' ||
    typeof data.authorName !== 'string' ||
    typeof data.body !== 'string' ||
    !Array.isArray(data.mentions)
  ) {
    return null;
  }
  const mentions = (data.mentions as unknown[]).filter(
    (m): m is string => typeof m === 'string'
  );
  const comment: PlcComment = {
    id,
    targetType,
    targetId: data.targetId,
    authorUid: data.authorUid,
    authorName: data.authorName,
    body: data.body,
    mentions,
    createdAt: tsToMillis(data.createdAt),
  };
  if (typeof data.editedAt === 'number') {
    comment.editedAt = data.editedAt;
  } else if (data.editedAt != null) {
    // Firestore Timestamp on a fresh edit before it round-trips as a number.
    comment.editedAt = tsToMillis(data.editedAt);
  } else if (data.editedAt === null) {
    comment.editedAt = null;
  }
  if (typeof data.deletedAt === 'number') {
    comment.deletedAt = data.deletedAt;
  } else if (data.deletedAt != null) {
    comment.deletedAt = tsToMillis(data.deletedAt);
  } else if (data.deletedAt === null) {
    comment.deletedAt = null;
  }
  return comment;
}

/**
 * Build the activity-event fan-out for a freshly posted comment (Decision 2.2 +
 * 2.6). Pure + exported so the mention→activity behavior is unit-testable
 * without Firestore. Returns, in order:
 *   1. ONE general `comment_added` event (no mention metadata) so the comment
 *      shows in the team activity feed / since-you-were-here digest.
 *   2. ONE `comment_added` event PER de-duplicated mentioned uid, carrying the
 *      mention metadata (`targetType: MENTION_ACTIVITY_TARGET_TYPE`,
 *      `targetId: <mentioned uid>`, `targetTitle: <thread targetId>`), so the
 *      mentioned member's unread badge (T3) increments.
 *
 * The actor never self-notifies: a mention of the author themselves is dropped
 * from the per-mention list (the general event already covers the author).
 */
export function buildCommentActivityEvents(params: {
  actorUid: string;
  actorName: string;
  targetType: PlcCommentTargetType;
  targetId: string;
  mentions: readonly string[];
}): PlcActivityEventInput[] {
  const { actorUid, actorName, targetType, targetId, mentions } = params;
  const events: PlcActivityEventInput[] = [
    {
      type: 'comment_added',
      actorUid,
      actorName,
      targetType: COMMENT_ACTIVITY_TARGET_TYPE,
      targetId,
      targetTitle: targetType,
    },
  ];
  const seen = new Set<string>();
  for (const uid of mentions) {
    if (typeof uid !== 'string' || uid.length === 0) continue;
    if (uid === actorUid) continue; // never self-notify
    if (seen.has(uid)) continue;
    seen.add(uid);
    events.push({
      type: 'comment_added',
      actorUid,
      actorName,
      targetType: MENTION_ACTIVITY_TARGET_TYPE,
      targetId: uid,
      targetTitle: targetId,
    });
  }
  return events;
}

/**
 * Live subscription to a scoped comment thread. `plcId`, `targetType`, and
 * `targetId` together select the thread; pass `null` for `plcId` to skip the
 * listener. The query filters server-side on `targetType`/`targetId` (a small
 * equality filter — no composite index needed) and the client drops soft-
 * deleted comments and sorts oldest-first for natural reading order.
 */
export function usePlcComments(
  plcId: string | null,
  targetType: PlcCommentTargetType,
  targetId: string
): UsePlcCommentsResult {
  const { user } = useAuth();
  const [comments, setComments] = useState<PlcComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Reset on thread change (different plc/target) so a stale thread's comments
  // never flash under a new card while the listener re-subscribes.
  const threadKey = `${plcId ?? ''}::${targetType}::${targetId}`;
  const [prevKey, setPrevKey] = useState(threadKey);
  if (threadKey !== prevKey) {
    setPrevKey(threadKey);
    setComments([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const tmr = setTimeout(() => {
        setComments([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(tmr);
    }
    const ref = collection(db, PLCS_COLLECTION, plcId, COMMENTS_SUBCOLLECTION);
    const unsub = onSnapshot(
      query(
        ref,
        where('targetType', '==', targetType),
        where('targetId', '==', targetId)
      ),
      (snap) => {
        const list: PlcComment[] = [];
        snap.forEach((d) => {
          const parsed = parseComment(
            d.id,
            d.data() as Record<string, unknown>
          );
          // Hide soft-deleted comments from the thread.
          if (parsed && parsed.deletedAt == null) list.push(parsed);
        });
        // Oldest-first for natural reading order (createdAt 0 = pending local
        // write, sorts last so a just-posted comment lands at the bottom).
        list.sort((a, b) => a.createdAt - b.createdAt);
        setComments(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcComments.snapshot', err, { plcId, targetType });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user, targetType, targetId]);

  const addComment = useCallback(
    async (input: AddCommentInput): Promise<string> => {
      if (!plcId || !user) throw new Error('Not signed in');
      // Snapshot a stable display name: prefer the user's display name, then
      // their email, falling back to the uid. An empty string is treated as
      // "absent" (hence the `||` chain, not `??`) so a blank display name still
      // falls through to the email.
      const displayName = user.displayName?.trim() ?? '';
      const emailName = user.email?.trim() ?? '';
      const authorName = displayName || emailName || user.uid;
      const ref = doc(
        collection(db, PLCS_COLLECTION, plcId, COMMENTS_SUBCOLLECTION)
      );
      // De-dupe mentions and drop a self-mention from the stored list so a
      // mention never double-fires; the stored `mentions` is the canonical set.
      const mentions = Array.from(
        new Set(
          input.mentions.filter(
            (m) => typeof m === 'string' && m.length > 0 && m !== user.uid
          )
        )
      );
      const payload: Record<string, unknown> = {
        id: ref.id,
        targetType: input.targetType,
        targetId: input.targetId,
        authorUid: user.uid,
        authorName,
        body: input.body,
        mentions,
        createdAt: serverTimestamp(),
      };
      await setDoc(ref, payload);

      // Activity fan-out (Decision 2.2 + 2.6) — fire-and-forget, never blocks
      // or fails the comment. One general event + one per mentioned member.
      const events = buildCommentActivityEvents({
        actorUid: user.uid,
        actorName: authorName,
        targetType: input.targetType,
        targetId: input.targetId,
        mentions,
      });
      for (const event of events) {
        void writePlcActivityEvent(plcId, event);
      }
      return ref.id;
    },
    [plcId, user]
  );

  const softDeleteComment = useCallback(
    async (commentId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const ref = doc(
        db,
        PLCS_COLLECTION,
        plcId,
        COMMENTS_SUBCOLLECTION,
        commentId
      );
      await updateDoc(ref, { deletedAt: serverTimestamp() });
    },
    [plcId, user]
  );

  const restoreComment = useCallback(
    async (commentId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const ref = doc(
        db,
        PLCS_COLLECTION,
        plcId,
        COMMENTS_SUBCOLLECTION,
        commentId
      );
      await updateDoc(ref, { deletedAt: null });
    },
    [plcId, user]
  );

  return useMemo(
    () => ({
      comments,
      loading,
      error,
      addComment,
      softDeleteComment,
      restoreComment,
    }),
    [comments, loading, error, addComment, softDeleteComment, restoreComment]
  );
}
