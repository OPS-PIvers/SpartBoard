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
 * have no join code and no session-mode variants. PR3 adds PLC sharing
 * (mirroring Quiz's `shareAssignment` / `importSharedAssignment` flows).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  getDocs,
  query,
  orderBy,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { invalidateSessionViewCount } from './useSessionViewCount';
import {
  callJoinSyncedVideoActivityGroup,
  callLeaveSyncedVideoActivityGroup,
  createSyncedVideoActivityGroup,
  pullSyncedVideoActivityContent,
} from './useSyncedVideoActivityGroups';
import { logError } from '../utils/logError';
import {
  mirrorPlcAssignmentStatus,
  writePlcAssignmentIndexEntry,
} from './usePlcAssignmentIndex';
import type {
  AssignmentMode,
  PlcAssignmentIndexEntry,
  SharedVideoActivityAssignment,
  VideoActivityAnswer,
  VideoActivityAssignment,
  VideoActivityAssignmentSettings,
  VideoActivityAssignmentSyncLinkage,
  VideoActivityAssignmentStatus,
  VideoActivityData,
  VideoActivityMetadata,
  VideoActivityMetadataSyncLinkage,
  VideoActivityResponse,
  VideoActivityScoreVisibility,
  VideoActivitySession,
} from '../types';
import { gradeVideoActivityAnswer } from '../utils/videoActivityGrading';

/**
 * Map VA assignment status onto the PLC index's shared `QuizAssignmentStatus`
 * union. The two unions are intentionally identical today; this helper
 * exists so a future schema split (e.g. VA gaining a 'review' phase) only
 * needs one switch to update. Keeps the call sites readable.
 */
function vaStatusToIndexStatus(
  s: VideoActivityAssignmentStatus
): PlcAssignmentIndexEntry['status'] {
  // Both unions are 'active' | 'paused' | 'inactive' today. The compiler
  // catches drift if either side adds a member.
  return s;
}

const VIDEO_ACTIVITY_ASSIGNMENTS_COLLECTION = 'video_activity_assignments';
const VIDEO_ACTIVITY_SESSIONS_COLLECTION = 'video_activity_sessions';
const VIDEO_ACTIVITY_METADATA_COLLECTION = 'video_activities';
const SHARED_VA_ASSIGNMENTS_COLLECTION = 'shared_video_activity_assignments';
const RESPONSES_COLLECTION = 'responses';

/** Import-mode picker result for shared-VA-assignment paste flows. */
export type SharedVideoActivityImportMode = 'sync' | 'copy';

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
    rosterIds?: string[],
    /** Org-wide assignment mode frozen onto the assignment + session.
     *  Defaults to `'submissions'` (preserves pre-feature behavior). */
    mode?: AssignmentMode
  ) => Promise<{ id: string }>;
  /** Set both assignment.status and session.status to 'paused' (assignment) / 'ended' (session). */
  pauseAssignment: (assignmentId: string) => Promise<void>;
  /** Resume a paused assignment — assignment='active', session='active'. */
  resumeAssignment: (assignmentId: string) => Promise<void>;
  /** Kills the student URL; preserves responses. assignment='inactive', session='ended'. */
  deactivateAssignment: (assignmentId: string) => Promise<void>;
  /**
   * Re-open a previously deactivated share (view-only mode only). Symmetric
   * to `deactivateAssignment`: flips assignment → 'active' and session →
   * 'active' so the URL works again. Submissions assignments don't expose
   * this affordance; reopening a stale roster is a different UX call.
   *
   * Behaviorally equivalent to `resumeAssignment` today (both call
   * `setStatus(id, 'active', 'active')`). Kept as a separate method so
   * callers can express *intent* — view-only Reactivate from inactive vs.
   * Resume from paused — and so the two can diverge later if Resume needs
   * to preserve, e.g., a paused-at timestamp or pending-question state.
   */
  reactivateAssignment: (assignmentId: string) => Promise<void>;
  /** Permanently delete assignment + session + all responses. */
  deleteAssignment: (assignmentId: string) => Promise<void>;
  /** Update editable settings (className, session toggles). */
  updateAssignmentSettings: (
    assignmentId: string,
    patch: Partial<VideoActivityAssignmentSettings>
  ) => Promise<void>;
  /**
   * Publish a shared-VA-assignment doc to `/shared_video_activity_assignments/`
   * and (if the source activity has no synced linkage yet) auto-create a
   * canonical group at `/synced_video_activities/{groupId}` so peer importers
   * can pick "Synced" mode. Returns the share URL the teacher copies.
   */
  shareAssignment: (
    assignmentId: string,
    activityData: VideoActivityData
  ) => Promise<string>;
  /**
   * Read-only fetch for a shared-assignment doc. Used by the importer's URL-
   * paste flow to preview the share before committing to copy/sync mode.
   */
  peekSharedAssignment: (
    shareId: string
  ) => Promise<SharedVideoActivityAssignment | null>;
  /**
   * Import a shared-assignment doc into the teacher's library. Mirrors
   * `useQuizAssignments.importSharedAssignment` — runs a copy of the
   * activity into the teacher's Drive, creates a paused local assignment,
   * and (in 'sync' mode) joins the synced group via the Cloud Function.
   *
   * The caller provides:
   *   - `saveActivity`: writes the inlined activity content into Drive
   *     and Firestore metadata (returns the created VideoActivityMetadata).
   *   - `attachSyncLinkage` (sync-mode only): patches the local activity's
   *     metadata with the synced-group linkage so future edits publish.
   */
  importSharedAssignment: (
    shareId: string,
    options: ImportSharedAssignmentOptions
  ) => Promise<{ assignmentId: string; activityId: string }>;
  /**
   * Publish (or unpublish) per-student scores for an assignment. Mirrors
   * `useQuizAssignments.publishAssignmentScores`. Grades every response
   * via `gradeVideoActivityAnswer` (handles MA / FIB-with-variants — the
   * Quiz grader's `'MA'` blind spot is irrelevant here), writes the
   * computed `score` + per-answer `isCorrect` flags onto each response,
   * and mirrors the visibility flag onto the assignment + session docs.
   *
   * `'none'` is the unpublish path: clears `scoreVisibility` on assignment
   * + session and wipes `revealedAnswers`. Already-written `score` /
   * `isCorrect` are left in place — the reader gates on `scoreVisibility`,
   * so this is harmless and avoids a multi-batch wipe on a gesture the
   * teacher may immediately undo.
   *
   * `'score-responses-and-answers'` populates `session.revealedAnswers`
   * (id → correctAnswer) so the student review screen can show the
   * canonical correct answer for each question — VA's session strips
   * correct answers from `publicQuestions` for the in-progress flow,
   * mirroring Quiz's student-safety pattern.
   */
  publishAssignmentScores: (
    assignmentId: string,
    activityData: VideoActivityData,
    visibility: VideoActivityScoreVisibility
  ) => Promise<{ responsesUpdated: number }>;
}

export interface ImportSharedAssignmentOptions {
  mode: SharedVideoActivityImportMode;
  /**
   * Persist a fresh copy of the activity content to the importer's Drive +
   * Firestore metadata. Returns the new VideoActivityMetadata so the
   * import flow can attach a sync linkage and create the local assignment.
   */
  saveActivity: (activity: VideoActivityData) => Promise<VideoActivityMetadata>;
  /**
   * Sync-mode only: write `sync.{ groupId, lastSyncedVersion }` onto the
   * importer's local `video_activities/{activityId}` metadata so the editor's
   * save path will publish future edits to the canonical group.
   */
  attachSyncLinkage?: (
    activityId: string,
    linkage: VideoActivityMetadataSyncLinkage
  ) => Promise<void>;
}

export const useVideoActivityAssignments = (
  userId: string | undefined
): UseVideoActivityAssignmentsResult => {
  const [assignments, setAssignments] = useState<VideoActivityAssignment[]>([]);
  const [loading, setLoading] = useState<boolean>(!!userId);
  const [error, setError] = useState<string | null>(null);

  // Live mirror of `assignments` so status mutators can look up a
  // PLC linkage by id without re-creating the callback every render
  // (which would churn downstream `useCallback` users). Mirrors the
  // `assignmentsRef` pattern in `useQuizAssignments.ts`.
  const assignmentsRef = useRef<VideoActivityAssignment[]>(assignments);
  useEffect(() => {
    assignmentsRef.current = assignments;
  }, [assignments]);

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
      rosterIds,
      mode = 'submissions'
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
        ...(settings.sessionOptions
          ? { sessionOptions: settings.sessionOptions }
          : {}),
        ...(settings.scoreVisibility
          ? { scoreVisibility: settings.scoreVisibility }
          : {}),
        ...(settings.periodNames && settings.periodNames.length > 0
          ? { periodNames: settings.periodNames }
          : {}),
        ...(targetRosterIds.length > 0 ? { rosterIds: targetRosterIds } : {}),
        // PLC linkage must persist on the assignment doc so the status
        // mutators (pause / resume / deactivate / reopen) can find the
        // target PLC index entry to mirror onto. Mirrors the quiz path —
        // `useQuizAssignments.createAssignment` spreads `settings.plc`
        // onto its assignment doc the same way.
        ...(settings.plc ? { plc: settings.plc } : {}),
        mode,
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
        ...(settings.sessionOptions
          ? { sessionOptions: settings.sessionOptions }
          : {}),
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
        mode,
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

      // PLC dashboard index: when this VA assignment opts into PLC mode,
      // record a snapshot under `plcs/{plcId}/assignment_index` so every
      // teammate sees it on the PLC Dashboard's PLC Assignments tab
      // alongside quiz entries. Fire-and-forget — the helper has its own
      // try/catch and never rejects, so the canonical commit returns
      // immediately. Mirrors the quiz path in `useQuizAssignments`.
      if (settings.plc) {
        const current = auth.currentUser;
        const ownerName = current?.displayName ?? '';
        const ownerEmail = (current?.email ?? '').toLowerCase();
        void writePlcAssignmentIndexEntry(settings.plc.id, {
          id: assignmentId,
          kind: 'video-activity',
          ownerUid: userId,
          ownerName,
          ownerEmail,
          title: activity.title,
          sheetUrl: settings.plc.sheetUrl,
          status: vaStatusToIndexStatus(initialStatus),
          createdAt: now,
        });
      }

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

      // Mirror status onto the PLC index entry when this assignment
      // participates in a PLC. Fire-and-forget — the canonical batch
      // commit above is the primary write; a mirror failure is logged
      // by the helper and doesn't reject. The lookup goes through the
      // ref mirror because `setStatus` is referenced by stable
      // callbacks (`pauseAssignment` etc.) and we don't want to churn
      // those callbacks every time `assignments` changes.
      const live = assignmentsRef.current.find((a) => a.id === assignmentId);
      if (live?.plc) {
        void mirrorPlcAssignmentStatus(
          live.plc.id,
          assignmentId,
          vaStatusToIndexStatus(assignmentStatus)
        );
      }
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

  const reactivateAssignment = useCallback<
    UseVideoActivityAssignmentsResult['reactivateAssignment']
  >(
    async (assignmentId) => {
      await setStatus(assignmentId, 'active', 'active');
      // Drop any cached view count so the Shared row re-issues the
      // aggregation query on next mount; the cache is module-scoped and
      // would otherwise hold the pre-Closed count forever.
      invalidateSessionViewCount('video_activity_sessions', assignmentId);
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
      // Mirror student-visible changes to the session doc so an in-flight
      // join picks them up on next visit. We propagate:
      //   - sessionSettings (player behavior — autoPlay, etc.)
      //   - sessionOptions (assignment policy — feedback, attempts, scoring)
      //   - className (rendered in the post-PIN picker as `assignmentName`)
      //   - periodNames (drive the period selector)
      const sessionPatch: Record<string, unknown> = {};
      if (patch.sessionSettings) sessionPatch.settings = patch.sessionSettings;
      if (patch.sessionOptions)
        sessionPatch.sessionOptions = patch.sessionOptions;
      if (patch.className !== undefined)
        sessionPatch.assignmentName = patch.className;
      if (patch.periodNames !== undefined)
        sessionPatch.periodNames = patch.periodNames;
      if (Object.keys(sessionPatch).length > 0) {
        // Tag the write with the originating user so a future bidirectional
        // edit flow (e.g. PLC sync) can suppress echoes back to the writer.
        // Currently teacher-only, so the field is informational; once PR3
        // adds shared sync this is the hook for echo prevention.
        sessionPatch.updatedBy = userId;
        batch.update(
          doc(db, VIDEO_ACTIVITY_SESSIONS_COLLECTION, assignmentId),
          sessionPatch
        );
      }
      await batch.commit();
    },
    [userId]
  );

  /**
   * Publish a shared-VA-assignment doc + auto-create a synced group if the
   * source activity has none yet. Mirrors `useQuizAssignments.shareAssignment`
   * but scoped to VA's parallel collections. The local activity metadata gets
   * its `sync` field patched in place so the editor's save path can publish
   * future edits to peers.
   */
  const shareAssignment = useCallback<
    UseVideoActivityAssignmentsResult['shareAssignment']
  >(
    async (assignmentId, activityData) => {
      if (!userId) throw new Error('Not authenticated');
      const assignmentRef = doc(
        db,
        'users',
        userId,
        VIDEO_ACTIVITY_ASSIGNMENTS_COLLECTION,
        assignmentId
      );
      const snap = await getDoc(assignmentRef);
      if (!snap.exists()) throw new Error('Assignment not found');
      const assignment = snap.data() as VideoActivityAssignment;

      const metaRef = doc(
        db,
        'users',
        userId,
        VIDEO_ACTIVITY_METADATA_COLLECTION,
        assignment.activityId
      );
      const metaSnap = await getDoc(metaRef);
      if (!metaSnap.exists()) {
        throw new Error(
          'Source activity is missing from your library — cannot share.'
        );
      }
      const meta = metaSnap.data() as VideoActivityMetadata;

      // Sync-mode plumbing: every share carries a `syncGroupId` so the
      // importer's mode picker can offer Synced. If the source is already
      // part of a group, reuse it; otherwise mint a fresh group with the
      // sharer as the sole participant.
      let syncGroupId = meta.sync?.groupId;
      // Track whether we just minted the linkage so the rollback path knows
      // whether to clear it. If the source already had a `sync.groupId` we
      // leave it alone on rollback — that linkage predates this share call.
      let mintedLinkage = false;
      if (!syncGroupId) {
        syncGroupId = crypto.randomUUID();
        await createSyncedVideoActivityGroup({
          groupId: syncGroupId,
          uid: userId,
          title: activityData.title,
          youtubeUrl: activityData.youtubeUrl,
          questions: activityData.questions,
          ...(assignment.plc?.id ? { plcId: assignment.plc.id } : {}),
        });
        await updateDoc(metaRef, {
          sync: { groupId: syncGroupId, lastSyncedVersion: 1 },
        });
        mintedLinkage = true;
      }

      const payload: Omit<SharedVideoActivityAssignment, 'id'> = {
        title: activityData.title,
        youtubeUrl: activityData.youtubeUrl,
        questions: activityData.questions,
        createdAt: activityData.createdAt,
        updatedAt: activityData.updatedAt,
        assignmentSettings: {
          className: assignment.className,
          sessionSettings: assignment.sessionSettings,
          ...(assignment.sessionOptions
            ? { sessionOptions: assignment.sessionOptions }
            : {}),
          ...(assignment.scoreVisibility
            ? { scoreVisibility: assignment.scoreVisibility }
            : {}),
          ...(assignment.periodNames && assignment.periodNames.length > 0
            ? { periodNames: assignment.periodNames }
            : {}),
          ...(assignment.periodName
            ? { periodName: assignment.periodName }
            : {}),
          ...(assignment.teacherName
            ? { teacherName: assignment.teacherName }
            : {}),
          ...(assignment.plc ? { plc: assignment.plc } : {}),
        },
        originalAuthor: userId,
        sharedAt: Date.now(),
        syncGroupId,
      };
      // Best-effort rollback: if `addDoc` fails AFTER we've minted the
      // synced-group linkage, clear the local metadata patch so the
      // teacher's library doesn't carry a sync linkage to a group with no
      // matching share doc. Non-rollback (rethrow original) on cleanup
      // failure — we can't do better than logging.
      let ref;
      try {
        ref = await addDoc(
          collection(db, SHARED_VA_ASSIGNMENTS_COLLECTION),
          payload
        );
      } catch (err) {
        if (mintedLinkage) {
          try {
            // Use `deleteField()` rather than `null` — Firestore would
            // otherwise persist a literal `null` and any reader using
            // `'sync' in meta` (or serialization) would see a phantom field
            // that no longer points anywhere.
            await updateDoc(metaRef, { sync: deleteField() });
          } catch (rollbackErr) {
            logError(
              'useVideoActivityAssignments.shareAssignment.rollback',
              rollbackErr,
              { assignmentId, syncGroupId }
            );
          }
        }
        throw err;
      }
      return `${window.location.origin}/share/video-activity/${ref.id}`;
    },
    [userId]
  );

  /** Read-only peek for the importer's URL-paste preview. */
  const peekSharedAssignment = useCallback<
    UseVideoActivityAssignmentsResult['peekSharedAssignment']
  >(async (shareId) => {
    const snap = await getDoc(
      doc(db, SHARED_VA_ASSIGNMENTS_COLLECTION, shareId)
    );
    if (!snap.exists()) return null;
    return {
      id: shareId,
      ...(snap.data() as Omit<SharedVideoActivityAssignment, 'id'>),
    };
  }, []);

  /**
   * Import a shared-VA-assignment into the local library. Forks the read-side
   * of `useQuizAssignments.importSharedAssignment`. The flow:
   *   1. Fetch the share doc.
   *   2. Save a fresh copy of the activity into the importer's Drive +
   *      Firestore metadata (caller-supplied `saveActivity`).
   *   3. (sync mode) Join the synced group via the Cloud Function and patch
   *      local metadata with the linkage.
   *   4. Create a paused local assignment seeded from the shared settings —
   *      with originator-only fields cleared (teacherName, periodName) so
   *      the importer doesn't masquerade as the original author.
   */
  const importSharedAssignment = useCallback<
    UseVideoActivityAssignmentsResult['importSharedAssignment']
  >(
    async (shareId, options) => {
      if (!userId) throw new Error('Not authenticated');
      const sharedDoc = await peekSharedAssignment(shareId);
      if (!sharedDoc) {
        throw new Error('Shared video activity not found.');
      }

      // 1) Sync mode FIRST — join the synced group and pull the canonical
      // content BEFORE we save the activity. This guarantees the local
      // replica matches the live group at join time; the share doc's
      // inlined content can be stale relative to the canonical (peers
      // edit the canonical via the publish transaction; the share doc is
      // a snapshot from the moment the originator clicked Share).
      let syncedFromLinkage: VideoActivityAssignmentSyncLinkage | undefined;
      let canonicalContent: {
        title: string;
        youtubeUrl: string;
        questions: typeof sharedDoc.questions;
      } | null = null;
      if (options.mode === 'sync' && sharedDoc.syncGroupId) {
        try {
          const joinResult = await callJoinSyncedVideoActivityGroup(shareId);
          const canonical = await pullSyncedVideoActivityContent(
            joinResult.groupId
          );
          canonicalContent = {
            title: canonical.title,
            youtubeUrl: canonical.youtubeUrl,
            questions: canonical.questions,
          };
          syncedFromLinkage = {
            groupId: joinResult.groupId,
            syncedVersion: canonical.version,
          };
        } catch (err) {
          // Best-effort leave: if the join itself failed there's nothing
          // to leave; if it succeeded but the pull failed, leave so the
          // importer doesn't accumulate orphan participation. Either way,
          // rethrow so the caller knows the import didn't run.
          if (sharedDoc.syncGroupId) {
            await callLeaveSyncedVideoActivityGroup(
              sharedDoc.syncGroupId
            ).catch((leaveErr) =>
              logError(
                'useVideoActivityAssignments.importSharedAssignment.rollbackJoin',
                leaveErr,
                { shareId }
              )
            );
          }
          throw err;
        }
      }

      // 2) Save activity content into the importer's library — using the
      // canonical content when sync mode succeeded, otherwise the share
      // doc's inline snapshot for copy mode.
      const importedActivity: VideoActivityData = {
        id: crypto.randomUUID(),
        title: canonicalContent?.title ?? sharedDoc.title,
        youtubeUrl: canonicalContent?.youtubeUrl ?? sharedDoc.youtubeUrl,
        questions: canonicalContent?.questions ?? sharedDoc.questions,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // From here onward, every failure must roll back the synced-group
      // join (if any) so the importer doesn't end up as a participant in
      // a group with no corresponding local assignment. Single try block
      // wrapping save → attach → create covers all three failure points.
      const rollbackLeave = async (rollbackErrCtx: string): Promise<void> => {
        if (!syncedFromLinkage) return;
        await callLeaveSyncedVideoActivityGroup(
          syncedFromLinkage.groupId
        ).catch((leaveErr) => logError(rollbackErrCtx, leaveErr, { shareId }));
      };

      try {
        const savedMeta = await options.saveActivity(importedActivity);

        if (syncedFromLinkage && options.attachSyncLinkage) {
          await options.attachSyncLinkage(savedMeta.id, {
            groupId: syncedFromLinkage.groupId,
            lastSyncedVersion: syncedFromLinkage.syncedVersion,
          });
        }

        // 3) Create the local assignment, paused. Originator-only fields
        // cleared: teacherName + periodName (which encode the original
        // author's identity / single-class targeting). PLC linkage is
        // preserved so the importer's results flow through the same
        // sheet for PLC peers.
        const sourceSettings = sharedDoc.assignmentSettings;
        const importedSettings: VideoActivityAssignmentSettings = {
          className: sourceSettings.className,
          sessionSettings: sourceSettings.sessionSettings,
          ...(sourceSettings.sessionOptions
            ? { sessionOptions: sourceSettings.sessionOptions }
            : {}),
          ...(sourceSettings.scoreVisibility
            ? { scoreVisibility: sourceSettings.scoreVisibility }
            : {}),
          ...(sourceSettings.periodNames &&
          sourceSettings.periodNames.length > 0
            ? { periodNames: sourceSettings.periodNames }
            : {}),
          ...(sourceSettings.plc ? { plc: sourceSettings.plc } : {}),
          ...(syncedFromLinkage ? { sync: syncedFromLinkage } : {}),
        };
        const created = await createAssignment(
          {
            id: savedMeta.id,
            title: savedMeta.title,
            driveFileId: savedMeta.driveFileId,
            youtubeUrl: savedMeta.youtubeUrl,
            questions: importedActivity.questions,
          },
          importedSettings,
          'paused'
        );
        return { assignmentId: created.id, activityId: savedMeta.id };
      } catch (err) {
        await rollbackLeave(
          'useVideoActivityAssignments.importSharedAssignment.rollbackSaveOrCreate'
        );
        throw err;
      }
    },
    [userId, peekSharedAssignment, createAssignment]
  );

  const publishAssignmentScores = useCallback<
    UseVideoActivityAssignmentsResult['publishAssignmentScores']
  >(
    async (assignmentId, activityData, visibility) => {
      if (!userId) throw new Error('Not authenticated');

      const now = Date.now();
      const assignmentRef = doc(
        db,
        'users',
        userId,
        VIDEO_ACTIVITY_ASSIGNMENTS_COLLECTION,
        assignmentId
      );
      const sessionRef = doc(
        db,
        VIDEO_ACTIVITY_SESSIONS_COLLECTION,
        assignmentId
      );

      if (visibility === 'none') {
        const batch = writeBatch(db);
        batch.update(assignmentRef, {
          scoreVisibility: 'none',
          scorePublishedAt: deleteField(),
          updatedAt: now,
        });
        batch.update(sessionRef, {
          scoreVisibility: 'none',
          revealedAnswers: deleteField(),
        });
        await batch.commit();
        return { responsesUpdated: 0 };
      }

      const questionsById = new Map(
        activityData.questions.map((q) => [q.id, q])
      );

      const responsesSnap = await getDocs(
        collection(
          db,
          VIDEO_ACTIVITY_SESSIONS_COLLECTION,
          assignmentId,
          RESPONSES_COLLECTION
        )
      );

      interface ResponseUpdate {
        ref: ReturnType<typeof doc>;
        patch: { score: number; answers: VideoActivityAnswer[] };
      }
      const updates: ResponseUpdate[] = [];
      for (const d of responsesSnap.docs) {
        const data = d.data() as VideoActivityResponse;
        const answers = Array.isArray(data.answers) ? data.answers : [];
        let pointsEarned = 0;
        let pointsMax = 0;
        const gradedAnswers: VideoActivityAnswer[] = answers.map((a) => {
          const q = questionsById.get(a.questionId);
          if (!q) {
            // Question deleted between submission and publish — drop any
            // stale `isCorrect` from a prior publish so the response
            // doesn't carry a value the canonical activity no longer
            // supports. Mirrors the Quiz pattern.
            const { isCorrect: _stale, ...rest } = a;
            void _stale;
            return rest;
          }
          const result = gradeVideoActivityAnswer(q, a.answer);
          pointsEarned += result.pointsEarned;
          pointsMax += result.pointsMax;
          return { ...a, isCorrect: result.isCorrect };
        });
        // Count unanswered questions toward the denominator so a blank
        // response scores 0%, not undefined. O(Q) Set lookup vs the
        // O(Q*A) `.some` pattern matters on PLC-shared assignments.
        const answeredQuestionIds = new Set<string>();
        for (const a of answers) answeredQuestionIds.add(a.questionId);
        for (const q of activityData.questions) {
          if (!answeredQuestionIds.has(q.id)) {
            pointsMax += q.points ?? 1;
          }
        }
        const score =
          pointsMax === 0 ? 0 : Math.round((pointsEarned / pointsMax) * 100);
        updates.push({
          ref: d.ref,
          patch: { score, answers: gradedAnswers },
        });
      }

      const MAX_BATCH_WRITES = 400;
      const firstBatch = writeBatch(db);
      firstBatch.update(assignmentRef, {
        scoreVisibility: visibility,
        scorePublishedAt: now,
        updatedAt: now,
      });
      const sessionPatch: Record<string, unknown> = {
        scoreVisibility: visibility,
      };
      if (visibility === 'score-responses-and-answers') {
        const revealedAnswers: Record<string, string> = {};
        for (const q of activityData.questions) {
          revealedAnswers[q.id] = q.correctAnswer;
        }
        sessionPatch.revealedAnswers = revealedAnswers;
      } else {
        sessionPatch.revealedAnswers = deleteField();
      }
      firstBatch.update(sessionRef, sessionPatch);

      // 2 writes already consumed (assignment + session); fill the rest
      // of the first batch with response updates so the visibility flip
      // is atomic with at least the first chunk of grades.
      const firstChunkSize = Math.min(updates.length, MAX_BATCH_WRITES - 2);
      for (let i = 0; i < firstChunkSize; i++) {
        firstBatch.update(updates[i].ref, updates[i].patch);
      }
      await firstBatch.commit();

      for (
        let cursor = firstChunkSize;
        cursor < updates.length;
        cursor += MAX_BATCH_WRITES
      ) {
        const chunk = updates.slice(cursor, cursor + MAX_BATCH_WRITES);
        const chunkBatch = writeBatch(db);
        for (const u of chunk) {
          chunkBatch.update(u.ref, u.patch);
        }
        await chunkBatch.commit();
      }

      return { responsesUpdated: updates.length };
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
    reactivateAssignment,
    deleteAssignment,
    updateAssignmentSettings,
    shareAssignment,
    peekSharedAssignment,
    importSharedAssignment,
    publishAssignmentScores,
  };
};
