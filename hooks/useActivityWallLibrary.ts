/**
 * useActivityWallLibrary — per-user Activity Wall library.
 *
 * Streams reusable Activity Wall activity definitions from
 * `/users/{userId}/activity_wall_activities/{activityId}` and exposes
 * upsert/delete operations. Activities used to live inline on the
 * Activity Wall widget's `config.activities` array, but that meant
 * removing the widget destroyed the activities. This hook is the new
 * source of truth so activities survive widget removal and stay in
 * sync across multiple open Activity Wall widgets via `onSnapshot`.
 *
 * Submissions are NOT stored here — they continue to live in
 * `activity_wall_sessions/{teacherUid}_{activityId}/submissions/*`. The
 * `id` of a library entry matches the `activityId` portion of the
 * session id, so existing sessions keep matching after migration.
 */

import { withoutClaudeReview } from '@/utils/claudeReview';
import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ActivityWallLibraryEntry } from '@/types';
import { activityWallSessionId } from '@/utils/activityWallLinks';
import { normalizeActivityWallLibraryEntry } from '@/utils/activityWallNormalize';
import { clearWallSubmissions } from '@/components/widgets/ActivityWall/hooks/useActivityWallSession';
import { useSandboxedActivityWalls } from './useTourSandboxed';

const COLLECTION = 'activity_wall_activities';

export interface UseActivityWallLibraryResult {
  activities: ActivityWallLibraryEntry[];
  loading: boolean;
  error: string | null;
  /**
   * Upsert an activity. Caller controls the `id` (stable across edits so
   * existing `activity_wall_sessions/{teacherUid}_{id}` continue to
   * match) and the `createdAt`/`updatedAt` timestamps.
   */
  saveActivity: (entry: ActivityWallLibraryEntry) => Promise<void>;
  deleteActivity: (activityId: string) => Promise<void>;
  /** Close the wall, delete every post, then reopen it if it was open. */
  clearActivityPosts: (activityId: string) => Promise<void>;
}

export const useActivityWallLibrary = (
  userId: string | undefined
): UseActivityWallLibraryResult => {
  const [activities, setActivities] = useState<ActivityWallLibraryEntry[]>([]);
  const [loading, setLoading] = useState(!!userId);
  const [error, setError] = useState<string | null>(null);
  const [prevUserId, setPrevUserId] = useState(userId);

  if (prevUserId !== userId) {
    setPrevUserId(userId);
    if (!userId) {
      setActivities([]);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'users', userId, COLLECTION),
      orderBy('updatedAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) =>
          normalizeActivityWallLibraryEntry(
            d.id,
            d.data() as Partial<ActivityWallLibraryEntry>
          )
        );
        setActivities(list);
        setLoading(false);
      },
      (err) => {
        console.error('[useActivityWallLibrary] Firestore error:', err);
        setError('Failed to load activities');
        setLoading(false);
      }
    );

    return unsub;
  }, [userId]);

  const saveActivity = useCallback(
    async (entry: ActivityWallLibraryEntry) => {
      if (!userId) throw new Error('Not signed in');
      // Spread the full entry so all optional fields (including classIds,
      // rosterIds, and any future additions) are persisted. Strip `classId`
      // when empty so Firestore doesn't store an empty string that breaks
      // the `passesStudentClassGate` rule, which expects either a real
      // sourcedId or an absent field.
      const { classId, ...rest } = withoutClaudeReview(entry);
      const payload: ActivityWallLibraryEntry = {
        ...rest,
        ...(classId ? { classId } : {}),
      };
      await setDoc(doc(db, 'users', userId, COLLECTION, entry.id), payload);
    },
    [userId]
  );

  const clearThenRun = useCallback(
    async (
      activityId: string,
      after: () => Promise<void>,
      reopenOnSuccess: boolean
    ) => {
      if (!userId) throw new Error('Not signed in');
      const sessionId = activityWallSessionId(userId, activityId);
      const sessionRef = doc(db, 'activity_wall_sessions', sessionId);
      // Close first so no post lands between clearing and finishing.
      let closed = false;
      let wasAccepting = true;
      try {
        const snap = await getDoc(sessionRef);
        wasAccepting = snap.data()?.acceptingResponses !== false;
        await updateDoc(sessionRef, { acceptingResponses: false });
        closed = true;
      } catch (closeError) {
        if ((closeError as { code?: string }).code !== 'not-found') {
          throw closeError;
        }
      }
      const reopen = () =>
        closed && wasAccepting
          ? updateDoc(sessionRef, { acceptingResponses: true }).catch(
              () => undefined
            )
          : Promise.resolve();
      try {
        await clearWallSubmissions(sessionId);
        await after();
      } catch (err) {
        await reopen();
        throw err;
      }
      if (reopenOnSuccess) await reopen();
    },
    [userId]
  );

  const removeActivity = useCallback(
    (activityId: string) =>
      clearThenRun(
        activityId,
        () => deleteDoc(doc(db, 'users', userId ?? '', COLLECTION, activityId)),
        false
      ),
    [clearThenRun, userId]
  );

  const clearActivityPosts = useCallback(
    (activityId: string) =>
      clearThenRun(activityId, () => Promise.resolve(), true),
    [clearThenRun]
  );

  return useSandboxedActivityWalls({
    activities,
    loading,
    error,
    saveActivity,
    deleteActivity: removeActivity,
    clearActivityPosts,
  });
};
