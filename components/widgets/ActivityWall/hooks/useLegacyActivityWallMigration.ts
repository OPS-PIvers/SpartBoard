// One-shot migrations of `config.activities` and orphaned session docs into the library.

import { useEffect, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  ActivityWallActivity,
  ActivityWallConfig,
  ActivityWallLibraryEntry,
} from '@/types';
import { normalizeActivityWallLibraryEntry } from '@/utils/activityWallNormalize';

interface MigrationArgs {
  uid: string | undefined;
  config: ActivityWallConfig;
  widgetId: string;
  libraryLoading: boolean;
  libraryCount: number;
  saveActivity: (entry: ActivityWallLibraryEntry) => Promise<void>;
  clearLegacyActivities: (widgetId: string) => void;
  addToast: (message: string, tone: 'success' | 'error' | 'info') => void;
}

const entryFromLegacyActivity = (
  activity: ActivityWallActivity,
  now: number
): ActivityWallLibraryEntry =>
  normalizeActivityWallLibraryEntry(activity.id, {
    id: activity.id,
    title: activity.title,
    prompt: activity.prompt,
    mode: activity.mode,
    moderationEnabled: activity.moderationEnabled,
    identificationMode: activity.identificationMode,
    createdAt: activity.startedAt ?? now,
    updatedAt: now,
    ...(activity.classId ? { classId: activity.classId } : {}),
  });

export const useLegacyActivityWallMigration = ({
  uid,
  config,
  widgetId,
  libraryLoading,
  libraryCount,
  saveActivity,
  clearLegacyActivities,
  addToast,
}: MigrationArgs): void => {
  const migrationRanRef = useRef(false);
  useEffect(() => {
    if (migrationRanRef.current || !uid) return;
    const legacy = config.activities ?? [];
    if (legacy.length === 0) return;
    migrationRanRef.current = true;
    void (async () => {
      const now = Date.now();
      try {
        await Promise.all(
          legacy.map((activity) =>
            saveActivity(entryFromLegacyActivity(activity, now))
          )
        );
        clearLegacyActivities(widgetId);
      } catch (err) {
        console.error(
          '[ActivityWall] Failed to migrate legacy activities to library:',
          err
        );
        migrationRanRef.current = false;
      }
    })();
  }, [uid, config.activities, widgetId, saveActivity, clearLegacyActivities]);

  const recoveryRanRef = useRef(false);
  useEffect(() => {
    if (recoveryRanRef.current) return;
    if (!uid || libraryLoading) return;
    if (libraryCount > 0) return;
    if ((config.activities ?? []).length > 0) return;
    const flagKey = `aw_library_recovery_v1_${uid}`;
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(flagKey) === 'done'
    ) {
      recoveryRanRef.current = true;
      return;
    }
    recoveryRanRef.current = true;
    void (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'activity_wall_sessions'),
            where('teacherUid', '==', uid)
          )
        );
        const recovered: ActivityWallLibraryEntry[] = [];
        snap.docs.forEach((docSnap) => {
          const {
            teacherUid: _teacherUid,
            publiclyShared: _publiclyShared,
            driveVisibility: _driveVisibility,
            latestShareCode: _latestShareCode,
            ...data
          } = docSnap.data() as Partial<ActivityWallLibraryEntry> & {
            activityId?: string;
            teacherUid?: string;
            publiclyShared?: boolean;
            driveVisibility?: string;
            latestShareCode?: string;
          };
          if (
            typeof data.activityId !== 'string' ||
            typeof data.title !== 'string' ||
            typeof data.prompt !== 'string'
          ) {
            return;
          }
          const updatedAt =
            typeof data.updatedAt === 'number' ? data.updatedAt : Date.now();
          recovered.push(
            normalizeActivityWallLibraryEntry(data.activityId, {
              ...data,
              id: data.activityId,
              createdAt: updatedAt,
              updatedAt,
            })
          );
        });
        await Promise.all(recovered.map((entry) => saveActivity(entry)));
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(flagKey, 'done');
        }
        if (recovered.length > 0) {
          addToast(
            `Restored ${recovered.length} wall${
              recovered.length === 1 ? '' : 's'
            } from past sessions.`,
            'success'
          );
        }
      } catch (err) {
        console.error(
          '[ActivityWall] Session-based library recovery failed:',
          err
        );
        recoveryRanRef.current = false;
      }
    })();
  }, [
    uid,
    libraryLoading,
    libraryCount,
    config.activities,
    saveActivity,
    addToast,
  ]);
};
