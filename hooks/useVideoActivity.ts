/**
 * useVideoActivity hook
 *
 * Manages video activity metadata in Firestore and full activity data in
 * Google Drive. Mirrors the pattern established by useQuiz.ts.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from './useGoogleDrive';
import { normalizeVideoActivityQuestions } from '@/utils/videoActivityNormalize';
import {
  VideoActivityData,
  VideoActivityMetadata,
  VideoActivityMetadataSyncLinkage,
} from '@/types';
import { QuizDriveService } from '@/utils/quizDriveService';
import {
  MockQuizDriveService,
  QuizDriveLike,
} from '@/utils/mockQuizDriveService';
import type { QuizData } from '@/types';

const VIDEO_ACTIVITIES_COLLECTION = 'video_activities';

export interface UseVideoActivityResult {
  activities: VideoActivityMetadata[];
  loading: boolean;
  error: string | null;
  /** Save or update an activity (saves JSON to Drive + upserts Firestore metadata). */
  saveActivity: (
    activity: VideoActivityData,
    existingDriveFileId?: string
  ) => Promise<VideoActivityMetadata>;
  /** Load full activity data from Drive by driveFileId. */
  loadActivityData: (driveFileId: string) => Promise<VideoActivityData>;
  /** Delete an activity from Drive and Firestore. */
  deleteActivity: (activityId: string, driveFileId: string) => Promise<void>;
  /**
   * Patch the synced-group linkage onto an activity's Firestore metadata.
   * Mirrors `useQuiz.attachSyncLinkage`: used by the shared-assignment import
   * flow to mark a freshly-imported activity as participating in a synced
   * group, so future edits publish to the canonical doc.
   */
  attachSyncLinkage: (
    activityId: string,
    linkage: VideoActivityMetadataSyncLinkage
  ) => Promise<void>;
  /** Create a template Google Sheet for CSV import. */
  createTemplateSheet: (title: string) => Promise<string>;
  /** Is a Drive service available? */
  isDriveConnected: boolean;
}

export const useVideoActivity = (
  userId: string | undefined
): UseVideoActivityResult => {
  const { googleAccessToken } = useAuth();
  const { isConnected } = useGoogleDrive();
  const [activities, setActivities] = useState<VideoActivityMetadata[]>([]);
  const [loading, setLoading] = useState(!!userId);
  const [error, setError] = useState<string | null>(null);
  const [prevUserId, setPrevUserId] = useState(userId);

  // Adjusting-state-while-rendering: synchronously reset on userId transitions.
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    if (!userId) {
      setActivities([]);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  // Real-time listener for activity metadata from Firestore
  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'users', userId, VIDEO_ACTIVITIES_COLLECTION),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: VideoActivityMetadata[] = snap.docs.map(
          (d) => d.data() as VideoActivityMetadata
        );
        setActivities(list);
        setLoading(false);
      },
      (err) => {
        console.error('[useVideoActivity] Firestore error:', err);
        setError('Failed to load video activities');
        setLoading(false);
      }
    );

    return unsub;
  }, [userId]);

  const getDriveService = useCallback((): QuizDriveLike => {
    if (isAuthBypass) {
      if (!userId) throw new Error('Not authenticated');
      return new MockQuizDriveService(userId);
    }
    if (!googleAccessToken) {
      throw new Error(
        'Not connected to Google Drive. Please sign in again to grant access.'
      );
    }
    return new QuizDriveService(googleAccessToken);
  }, [googleAccessToken, userId]);

  const saveActivity = useCallback(
    async (
      activity: VideoActivityData,
      existingDriveFileId?: string
    ): Promise<VideoActivityMetadata> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();
      const updated: VideoActivityData = { ...activity, updatedAt: Date.now() };

      // Reuse the quiz drive service — saves JSON to the same Drive folder
      // Cast to satisfy the method signature (VideoActivityData is structurally
      // compatible with the JSON blob the service writes).
      const driveFileId = await drive.saveQuiz(
        updated as unknown as QuizData,
        existingDriveFileId
      );

      const metadata: VideoActivityMetadata = {
        id: activity.id,
        title: activity.title,
        youtubeUrl: activity.youtubeUrl,
        driveFileId,
        questionCount: activity.questions.length,
        createdAt: activity.createdAt,
        updatedAt: updated.updatedAt,
      };

      await setDoc(
        doc(db, 'users', userId, VIDEO_ACTIVITIES_COLLECTION, activity.id),
        metadata
      );

      return metadata;
    },
    [userId, getDriveService]
  );

  const loadActivityData = useCallback(
    async (driveFileId: string): Promise<VideoActivityData> => {
      const drive = getDriveService();
      // loadQuiz returns the raw JSON blob we stored — it is a VideoActivityData
      const raw = (await drive.loadQuiz(
        driveFileId
      )) as unknown as VideoActivityData;
      // Normalize legacy V1 questions (no `type`, no `points`) up to the
      // PR2a shape so consumers can rely on the fields being present.
      return {
        ...raw,
        questions: normalizeVideoActivityQuestions(raw.questions),
      };
    },
    [getDriveService]
  );

  const deleteActivity = useCallback(
    async (activityId: string, driveFileId: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();

      await drive.deleteQuizFile(driveFileId).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[useVideoActivity] Drive delete warning:', msg);
      });

      await deleteDoc(
        doc(db, 'users', userId, VIDEO_ACTIVITIES_COLLECTION, activityId)
      );
    },
    [userId, getDriveService]
  );

  const createTemplateSheet = useCallback(
    async (title: string): Promise<string> => {
      const drive = getDriveService();
      return drive.createVideoActivityTemplate(title);
    },
    [getDriveService]
  );

  const attachSyncLinkage = useCallback(
    async (
      activityId: string,
      linkage: VideoActivityMetadataSyncLinkage
    ): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const metaRef = doc(
        db,
        'users',
        userId,
        VIDEO_ACTIVITIES_COLLECTION,
        activityId
      );
      const snap = await getDoc(metaRef);
      if (!snap.exists()) {
        throw new Error(
          `Cannot attach sync linkage: activity ${activityId} not in library.`
        );
      }
      const existing = snap.data() as VideoActivityMetadata;
      if (
        existing.sync?.groupId === linkage.groupId &&
        existing.sync?.lastSyncedVersion === linkage.lastSyncedVersion
      ) {
        return;
      }
      await setDoc(
        metaRef,
        {
          ...existing,
          sync: {
            groupId: linkage.groupId,
            lastSyncedVersion: linkage.lastSyncedVersion,
          },
        } satisfies VideoActivityMetadata,
        { merge: false }
      );
    },
    [userId]
  );

  return {
    activities,
    loading,
    error,
    saveActivity,
    loadActivityData,
    deleteActivity,
    createTemplateSheet,
    attachSyncLinkage,
    isDriveConnected: isAuthBypass || isConnected,
  };
};
