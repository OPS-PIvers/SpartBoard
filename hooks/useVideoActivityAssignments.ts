/**
 * useVideoActivityAssignments hook
 *
 * Manages the per-teacher archive of video-activity assignments. An
 * "assignment" is a single instance of a Video Activity being handed out —
 * it pairs a VideoActivityAssignment document (under
 * /users/{teacherUid}/video_activity_assignments/) with a VideoActivitySession
 * document (under /video_activity_sessions/{sessionId}) 1:1.
 *
 * Mirrors the shape of useQuizAssignments but simplified: Video Activities
 * have no join code, no session-mode variants, no PLC sharing, and session
 * status is binary (active | ended). Assignment statuses still distinguish
 * active/paused/inactive so the In Progress tab can surface paused sessions
 * the teacher may want to resume.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  getDocs,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  VideoActivityAssignment,
  VideoActivityAssignmentSettings,
  VideoActivityAssignmentStatus,
  VideoActivityData,
  VideoActivitySession,
} from '../types';

const VIDEO_ACTIVITY_ASSIGNMENTS_COLLECTION = 'video_activity_assignments';
const VIDEO_ACTIVITY_SESSIONS_COLLECTION = 'video_activity_sessions';
const RESPONSES_COLLECTION = 'responses';

/**
 * Minimal activity data needed to stand up an assignment. The driveFileId lets
 * downstream views hydrate the full question set from Drive later.
 */
export interface AssignmentActivityRef {
  id: string;
  title: string;
  driveFileId: string;
  youtubeUrl: string;
  questions: VideoActivityData['questions'];
}

export interface UseVideoActivityAssignmentsResult {
  assignments: VideoActivityAssignment[];
  loading: boolean;
  error: string | null;
  /**
   * Create a new assignment + its matching session doc in one batch.
   * Returns the new assignment's id (== sessionId).
   *
   * `classIds` is the list of ClassLink class `sourcedId`s this session is
   * targeted at (Phase 5A multi-class). When non-empty, the session doc
   * stores them on `classIds` (and transitionally mirrors `classIds[0]` to
   * `classId`). `periodNames` is the list of class-period labels available
   * for the post-PIN picker.
   */
  createAssignment: (
    activity: AssignmentActivityRef,
    settings: VideoActivityAssignmentSettings,
    initialStatus?: VideoActivityAssignmentStatus,
    classIds?: string[],
    periodNames?: string[],
    rosterIds?: string[]
  ) => Promise<{ id: string }>;
  /** Set both assignment.status and session.status to 'paused' (assignment) / 'ended' (session). */
  pauseAssignment: (assignmentId: string) => Promise<void>;
  /** Resume a paused assignment — assignment='active', session='active'. */
  resumeAssignment: (assignmentId: string) => Promise<void>;
  /** Kills the student URL; preserves responses. assignment='inactive', session='ended'. */
  deactivateAssignment: (assignmentId: string) => Promise<void>;
  /** Permanently delete assignment + session + all responses. */
  deleteAssignment: (assignmentId: string) => Promise<void>;
  /** Update editable settings (className, session toggles). */
  updateAssignmentSettings: (
    assignmentId: string,
    patch: Partial<VideoActivityAssignmentSettings>
  ) => Promise<void>;
}

export const useVideoActivityAssignments = (
  userId: string | undefined
): UseVideoActivityAssignmentsResult => {
  const [assignments, setAssignments] = useState<VideoActivityAssignment[]>([]);
  const [loading, setLoading] = useState<boolean>(!!userId);
  const [error, setError] = useState<string | null>(null);

  // Adjust state during render when userId transitions away — avoids the
  // "set-state-in-effect" anti-pattern while still clearing stale data when
  // the user signs out.
  const [prevUserId, setPrevUserId] = useState(userId);
  if (userId !== prevUserId) {
    setPrevUserId(userId);
    if (!userId) {
      setAssignments([]);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'users', userId, VIDEO_ACTIVITY_ASSIGNMENTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAssignments(
          snap.docs.map(
            (d) => ({ ...d.data(), id: d.id }) as VideoActivityAssignment
          )
        );
        setLoading(false);
      },
      (err) => {
        console.error('[useVideoActivityAssignments] Firestore error:', err);
        setError('Failed to load assignments');
        setLoading(false);
      }
    );
    return unsub;
  }, [userId]);

  const createAssignment = useCallback<
    UseVideoActivityAssignmentsResult['createAssignment']
  >(
    async (
      activity,
      settings,
      initialStatus = 'active',
      classIds,
      periodNames,
      rosterIds
    ) => {
      if (!userId) throw new Error('Not authenticated');
      const targetClassIds = classIds ?? [];
      const targetPeriodNames = periodNames ?? [];
      const targetRosterIds = rosterIds ?? [];
      const assignmentId = crypto.randomUUID();
      const now = Date.now();

      const assignment: VideoActivityAssignment = {
        id: assignmentId,
        activityId: activity.id,
        activityTitle: activity.title,
        activityDriveFileId: activity.driveFileId,
        teacherUid: userId,
        status: initialStatus,
        createdAt: now,
        updatedAt: now,
        className: settings.className,
        sessionSettings: settings.sessionSettings,
        ...(targetRosterIds.length > 0 ? { rosterIds: targetRosterIds } : {}),
      };

      // Session's status is binary — if the assignment is paused or inactive,
      // the session is 'ended' (students can't join/submit). Only an 'active'
      // assignment produces an 'active' session.
      const sessionStatus: VideoActivitySession['status'] =
        initialStatus === 'active' ? 'active' : 'ended';

      const session: VideoActivitySession = {
        id: assignmentId,
        activityId: activity.id,
        activityTitle: activity.title,
        assignmentName: settings.className ?? activity.title,
        teacherUid: userId,
        youtubeUrl: activity.youtubeUrl,
        questions: activity.questions,
        settings: settings.sessionSettings,
        status: sessionStatus,
        allowedPins: [],
        createdAt: now,
        ...(sessionStatus === 'ended' ? { endedAt: now } : {}),
        // Phase 5A: multi-class ClassLink targeting + post-PIN period picker.
        // Mirror `classIds[0]` into the legacy `classId` field so
        // pre-Phase-5A rules keep gating correctly until the fallback is
        // removed.
        ...(targetClassIds.length > 0
          ? { classIds: targetClassIds, classId: targetClassIds[0] }
          : {}),
        ...(targetPeriodNames.length > 0
          ? { periodNames: targetPeriodNames }
          : {}),
        ...(targetRosterIds.length > 0 ? { rosterIds: targetRosterIds } : {}),
      };

      const batch = writeBatch(db);
      batch.set(
        doc(
          db,
          'users',
          userId,
          VIDEO_ACTIVITY_ASSIGNMENTS_COLLECTION,
          assignmentId
        ),
        assignment
      );
      batch.set(
        doc(db, VIDEO_ACTIVITY_SESSIONS_COLLECTION, assignmentId),
        session
      );
      await batch.commit();

      return { id: assignmentId };
    },
    [userId]
  );

  const setStatus = useCallback(
    async (
      assignmentId: string,
      assignmentStatus: VideoActivityAssignmentStatus,
      sessionStatus: VideoActivitySession['status']
    ): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const now = Date.now();
      const batch = writeBatch(db);
      batch.update(
        doc(
          db,
          'users',
          userId,
          VIDEO_ACTIVITY_ASSIGNMENTS_COLLECTION,
          assignmentId
        ),
        { status: assignmentStatus, updatedAt: now }
      );
      const sessionPatch: Record<string, unknown> = { status: sessionStatus };
      if (sessionStatus === 'ended') sessionPatch.endedAt = now;
      batch.update(
        doc(db, VIDEO_ACTIVITY_SESSIONS_COLLECTION, assignmentId),
        sessionPatch
      );
      await batch.commit();
    },
    [userId]
  );

  const pauseAssignment = useCallback<
    UseVideoActivityAssignmentsResult['pauseAssignment']
  >(
    async (assignmentId) => {
      // VA sessions are binary (active | ended), so "pause" stops student
      // submissions for now by moving the session to 'ended'. The assignment
      // remains 'paused' so the teacher can later resume it.
      await setStatus(assignmentId, 'paused', 'ended');
    },
    [setStatus]
  );

  const resumeAssignment = useCallback<
    UseVideoActivityAssignmentsResult['resumeAssignment']
  >(
    async (assignmentId) => {
      await setStatus(assignmentId, 'active', 'active');
    },
    [setStatus]
  );

  const deactivateAssignment = useCallback<
    UseVideoActivityAssignmentsResult['deactivateAssignment']
  >(
    async (assignmentId) => {
      await setStatus(assignmentId, 'inactive', 'ended');
    },
    [setStatus]
  );

  const deleteAssignment = useCallback<
    UseVideoActivityAssignmentsResult['deleteAssignment']
  >(
    async (assignmentId) => {
      if (!userId) throw new Error('Not authenticated');

      // Delete all response documents first (batched)
      const responsesSnap = await getDocs(
        collection(
          db,
          VIDEO_ACTIVITY_SESSIONS_COLLECTION,
          assignmentId,
          RESPONSES_COLLECTION
        )
      );
      const BATCH_LIMIT = 500;
      for (let i = 0; i < responsesSnap.docs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        responsesSnap.docs
          .slice(i, i + BATCH_LIMIT)
          .forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // Delete the session doc and the assignment doc in one batch
      const batch = writeBatch(db);
      batch.delete(doc(db, VIDEO_ACTIVITY_SESSIONS_COLLECTION, assignmentId));
      batch.delete(
        doc(
          db,
          'users',
          userId,
          VIDEO_ACTIVITY_ASSIGNMENTS_COLLECTION,
          assignmentId
        )
      );
      await batch.commit();
    },
    [userId]
  );

  const updateAssignmentSettings = useCallback<
    UseVideoActivityAssignmentsResult['updateAssignmentSettings']
  >(
    async (assignmentId, patch) => {
      if (!userId) throw new Error('Not authenticated');
      const now = Date.now();
      const batch = writeBatch(db);
      batch.update(
        doc(
          db,
          'users',
          userId,
          VIDEO_ACTIVITY_ASSIGNMENTS_COLLECTION,
          assignmentId
        ),
        { ...patch, updatedAt: now } as Record<string, unknown>
      );
      // Mirror session-settings changes to the session doc so students pick
      // them up on next join.
      if (patch.sessionSettings) {
        batch.update(
          doc(db, VIDEO_ACTIVITY_SESSIONS_COLLECTION, assignmentId),
          { settings: patch.sessionSettings }
        );
      }
      await batch.commit();
    },
    [userId]
  );

  return {
    assignments,
    loading,
    error,
    createAssignment,
    pauseAssignment,
    resumeAssignment,
    deactivateAssignment,
    deleteAssignment,
    updateAssignmentSettings,
  };
};
