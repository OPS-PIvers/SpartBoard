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

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ActivityWallLibraryEntry } from '@/types';
import { normalizeActivityWallLibraryEntry } from '@/utils/activityWallNormalize';

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
      const { classId, ...rest } = entry;
      const payload: ActivityWallLibraryEntry = {
        ...rest,
        ...(classId ? { classId } : {}),
      };
      await setDoc(doc(db, 'users', userId, COLLECTION, entry.id), payload);
    },
    [userId]
  );

  const removeActivity = useCallback(
    async (activityId: string) => {
      if (!userId) throw new Error('Not signed in');
      await deleteDoc(doc(db, 'users', userId, COLLECTION, activityId));
    },
    [userId]
  );

  return {
    activities,
    loading,
    error,
    saveActivity,
    deleteActivity: removeActivity,
  };
};
