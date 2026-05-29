/**
 * VideoActivityWidget — main orchestrator component.
 * Manages view state (manager / create / results) and the editor modal.
 * The question-authoring editor lives in VideoActivityEditorModal, rendered
 * as a sibling of the Manager library view.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  WidgetData,
  VideoActivityConfig,
  VideoActivityView,
  VideoActivityAssignment,
  VideoActivityMetadata,
  VideoActivityData,
  VideoActivitySessionSettings,
  VideoActivitySessionOptions,
  VideoActivityGlobalConfig,
  VideoActivitySession,
} from '@/types';
import { PublishScoresModal } from '@/components/common/library/PublishScoresModal';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { useVideoActivitySessionTeacher } from '@/hooks/useVideoActivitySession';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import { useBusyIdSet } from '@/hooks/useBusyIdSet';
import { useFolders } from '@/hooks/useFolders';
import { usePlcs } from '@/hooks/usePlcs';
import {
  callLeaveSyncedVideoActivityGroup,
  createSyncedVideoActivityGroup,
} from '@/hooks/useSyncedVideoActivityGroups';
import { writePlcVideoActivityEntry } from '@/hooks/usePlcVideoActivities';
import { PlcShareTargetModal } from '@/components/plc/PlcShareTargetModal';
import { logError } from '@/utils/logError';
import { VideoActivityManager } from './components/VideoActivityManager';
import { Creator } from './components/Creator';
import { Results } from './components/Results';
import { VideoActivityLiveMonitor } from './components/VideoActivityLiveMonitor';
import { VideoActivityEditorModal } from './components/VideoActivityEditorModal';
import { getVideoActivityBehavior } from '@/utils/videoActivityBehavior';
import { AlertTriangle, Loader2, LogIn } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';

/**
 * Shared clipboard helper — centralizes the feature-detection + toast flow
 * that was previously duplicated across the Assign and Archive copy-URL
 * handlers. Keeps the widget self-contained; if other widgets need the same
 * pattern later we can promote this to `utils/` without an API change.
 */
async function copyUrlToClipboard(
  url: string,
  addToast: (msg: string, tone: 'success' | 'error' | 'info') => void,
  {
    successMessage,
    errorMessage,
  }: {
    successMessage: string;
    errorMessage: string;
  }
): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    addToast(errorMessage, 'info');
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    addToast(successMessage, 'success');
  } catch {
    addToast(errorMessage, 'info');
  }
}

export const VideoActivityWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast, rosters } = useDashboard();
  const {
    user,
    googleAccessToken,
    isAdmin,
    canAccessFeature,
    featurePermissions,
    getAssignmentMode,
  } = useAuth();
  const vaAssignmentMode = getAssignmentMode('videoActivity');
  const config = widget.config as VideoActivityConfig;

  const {
    activities,
    loading,
    error,
    saveActivity,
    loadActivityData,
    deleteActivity,
    duplicateActivity,
    attachSyncLinkage,
    createTemplateSheet,
    isDriveConnected,
  } = useVideoActivity(user?.uid);

  const { plcs } = usePlcs();

  const {
    createSession,
    responses,
    liveSession,
    subscribeToSession,
    unsubscribeFromSession,
    unlockStudentAttempt,
  } = useVideoActivitySessionTeacher();

  const {
    assignments,
    loading: assignmentsLoading,
    pauseAssignment,
    resumeAssignment,
    deactivateAssignment,
    reactivateAssignment,
    deleteAssignment,
    shareAssignment,
    publishAssignmentScores,
    unpublishAssignmentScores,
  } = useVideoActivityAssignments(user?.uid);

  const [publishingAssignment, setPublishingAssignment] =
    useState<VideoActivityAssignment | null>(null);

  // PLC share target — set when the teacher picks "Share with PLC" on a
  // library row. The `PlcShareTargetModal` is rendered as a sibling and
  // gates the actual `handleShareWithPlc` call on PLC selection.
  const [shareWithPlcTarget, setShareWithPlcTarget] =
    useState<VideoActivityMetadata | null>(null);

  const [loadingActivity, setLoadingActivity] = useState(false);
  const [selectedSession, setSelectedSession] =
    useState<VideoActivitySession | null>(null);
  // Monotonically increasing token to guard against rapid Monitor/Results
  // clicks across different assignments — we bail out of any stale fetch
  // resolution that's no longer the most recent attempt.
  const sessionLoadAttemptRef = useRef(0);

  // Editor modal state — ephemeral, not persisted to Firestore.
  const [editingActivity, setEditingActivity] =
    useState<VideoActivityData | null>(null);
  const [editingMeta, setEditingMeta] = useState<VideoActivityMetadata | null>(
    null
  );

  // Shared rapid-click guard. See `hooks/useBusyIdSet.ts`.
  const duplicateBusy = useBusyIdSet();

  const { folders: videoActivityFolders, moveItem: moveVideoActivityItem } =
    useFolders(user?.uid, 'video_activity');

  // Get global AI generation permission from feature permissions
  const videoActivityPerm = featurePermissions.find(
    (p) => p.widgetType === 'video-activity'
  );
  const aiEnabled =
    (videoActivityPerm?.config as VideoActivityGlobalConfig)?.aiEnabled ?? true;

  // Check if the admin audio transcription feature is enabled (admin-gated global feature)
  const audioTranscriptionEnabled =
    isAdmin === true && canAccessFeature('video-activity-audio-transcription');

  const setView = useCallback(
    (view: VideoActivityConfig['view']) => {
      updateWidget(widget.id, {
        config: { ...config, view } as VideoActivityConfig,
      });
    },
    [updateWidget, widget.id, config]
  );

  const loadActivity = useCallback(
    async (meta: VideoActivityMetadata): Promise<VideoActivityData | null> => {
      setLoadingActivity(true);
      try {
        const data = await loadActivityData(meta.driveFileId);
        return data;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to load activity';
        addToast(msg, 'error');
        return null;
      } finally {
        setLoadingActivity(false);
      }
    },
    [loadActivityData, addToast]
  );

  // ─── Reactive cleanup ──────────────────────────────────────────────────
  //
  // Auto-exit the live monitor if the assignment under it goes inactive
  // (deactivated from another tab) or the session doc is deleted. Without
  // this the header would silently misrepresent state — pause/end both
  // write `session.status='ended'`, so the monitor can't tell them apart
  // from `session` alone, and a deleted session leaves a stale snapshot.
  // Effect must run before the early-return guards below to keep hook
  // order stable across renders.
  const rawViewForGuard = config.view as
    | VideoActivityView
    | 'editor'
    | undefined;
  const viewForGuard: VideoActivityView =
    rawViewForGuard === 'editor' || !rawViewForGuard
      ? 'manager'
      : rawViewForGuard;
  useEffect(() => {
    if (viewForGuard !== 'monitor' || !selectedSession || assignmentsLoading)
      return;
    const match = assignments.find((a) => a.id === selectedSession.id);
    if (match && match.status !== 'inactive') return;
    unsubscribeFromSession();
    setSelectedSession(null);
    addToast('Assignment is no longer active — returning to library.', 'info');
    updateWidget(widget.id, {
      config: {
        ...config,
        view: 'manager',
        resultsSessionId: null,
      } as VideoActivityConfig,
    });
  }, [
    viewForGuard,
    selectedSession,
    assignments,
    assignmentsLoading,
    unsubscribeFromSession,
    addToast,
    updateWidget,
    widget.id,
    config,
  ]);

  /**
   * Share a video activity with a PLC. Mirrors `QuizWidget.handleShareWithPlc`:
   *   1. Load Drive content for the activity.
   *   2. Promote to a synced group (if not already synced).
   *      - Mint `synced_video_activities/{groupId}` via
   *        `createSyncedVideoActivityGroup`.
   *      - Attach the sync linkage to the local Firestore metadata so the
   *        library card thereafter surfaces the "Synced" pill.
   *      - On linkage failure, best-effort leave the just-minted group so
   *        we don't leak a phantom participant.
   *   3. Write the `plcs/{plcId}/video_activities/{uuid}` header doc via
   *      `writePlcVideoActivityEntry`.
   *
   * If step 3 fails after step 2 succeeded, the synced group + sync
   * linkage stay in place — the local library card still shows the
   * "Synced" pill (self-only group), and a retry of "Share with PLC"
   * reuses the existing groupId rather than minting a new one. Idempotent
   * on retry.
   */
  const handleShareWithPlc = useCallback(
    async (
      activityMeta: VideoActivityMetadata,
      plcId: string
    ): Promise<void> => {
      if (!user) throw new Error('Not authenticated.');
      const plc = plcs.find((p) => p.id === plcId);
      if (!plc) {
        throw new Error('That PLC is no longer available.');
      }
      const data = await loadActivityData(activityMeta.driveFileId);

      let syncGroupId: string;
      if (activityMeta.sync) {
        syncGroupId = activityMeta.sync.groupId;
      } else {
        syncGroupId = crypto.randomUUID();
        await createSyncedVideoActivityGroup({
          groupId: syncGroupId,
          uid: user.uid,
          title: data.title,
          youtubeUrl: data.youtubeUrl,
          questions: data.questions,
          plcId,
          behavior: activityMeta.behavior,
        });
        try {
          await attachSyncLinkage(activityMeta.id, {
            groupId: syncGroupId,
            lastSyncedVersion: 1,
          });
        } catch (linkageErr) {
          // Best-effort rollback so the freshly-minted group doesn't
          // dangle with a phantom participant pointing at a local
          // library that never recorded the linkage.
          try {
            await callLeaveSyncedVideoActivityGroup(syncGroupId);
          } catch (leaveErr) {
            logError(
              'VideoActivityWidget.shareWithPlc.rollbackLeave',
              leaveErr,
              { plcId, syncGroupId }
            );
          }
          throw linkageErr;
        }
      }

      const ownerEmailLower =
        plc.memberEmails?.[user.uid] ??
        (user.email ? user.email.toLowerCase() : '');
      await writePlcVideoActivityEntry(plcId, user.uid, {
        plcVideoActivityId: crypto.randomUUID(),
        syncGroupId,
        title: data.title,
        youtubeUrl: data.youtubeUrl,
        questionCount: data.questions.length,
        sharedByName: user.displayName ?? '',
        sharedByEmail: ownerEmailLower,
      });
    },
    [attachSyncLinkage, loadActivityData, plcs, user]
  );

  // ─── Guards ────────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <ScaledEmptyState
        icon={LogIn}
        title="Sign in required"
        subtitle="Sign in with Google to use Video Activities."
      />
    );
  }

  if (!isDriveConnected && !googleAccessToken) {
    return (
      <ScaledEmptyState
        icon={AlertTriangle}
        title="Drive access needed"
        subtitle="Sign out and sign in again to grant Google Drive access."
      />
    );
  }

  if (loadingActivity) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-slate-400"
        style={{ gap: 'min(12px, 3cqmin)' }}
      >
        <Loader2
          className="animate-spin"
          style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
        />
        <span style={{ fontSize: 'min(13px, 4.5cqmin)' }}>
          Loading activity…
        </span>
      </div>
    );
  }

  // ─── Views ─────────────────────────────────────────────────────────────────

  // Normalize legacy `view: 'editor'` persisted by pre-Phase 2 dashboards back
  // to 'manager' since editing now happens in a modal rather than a sub-view.
  // `view` is stripped by `stripTransientKeys` on any subsequent save, so stale
  // values will clean themselves up without a proactive Firestore write.
  const rawView = config.view as VideoActivityView | 'editor' | undefined;
  const view: VideoActivityView =
    rawView === 'editor' || !rawView ? 'manager' : rawView;

  const defaultSessionSettings: VideoActivitySessionSettings = {
    autoPlay: config.autoPlay ?? false,
    requireCorrectAnswer: config.requireCorrectAnswer ?? true,
    allowSkipping: config.allowSkipping ?? false,
  };

  if (view === 'create') {
    return (
      <Creator
        onBack={() => setView('manager')}
        aiEnabled={aiEnabled}
        isAdmin={isAdmin ?? false}
        audioTranscriptionEnabled={audioTranscriptionEnabled}
        createTemplateSheet={createTemplateSheet}
        onSave={async (activity) => {
          try {
            await saveActivity(activity);
            addToast('Activity saved to Drive!', 'success');
            setView('manager');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Save failed',
              'error'
            );
          }
        }}
      />
    );
  }

  if (view === 'results' && selectedSession) {
    const resultsAssignment = assignments.find(
      (a) => a.id === selectedSession.id
    );
    return (
      <Results
        session={selectedSession}
        responses={responses}
        plc={resultsAssignment?.plc}
        onBack={() => {
          unsubscribeFromSession();
          setSelectedSession(null);
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'manager',
              resultsSessionId: null,
            } as VideoActivityConfig,
          });
        }}
      />
    );
  }

  if (view === 'monitor' && selectedSession) {
    // Prefer the live snapshot when it's caught up to the assignment we
    // opened the monitor for; otherwise fall back to the initial fetch so
    // the view never flashes empty between subscribe and first snapshot.
    const sessionForMonitor =
      liveSession && liveSession.id === selectedSession.id
        ? liveSession
        : selectedSession;
    return (
      <VideoActivityLiveMonitor
        session={sessionForMonitor}
        responses={responses}
        onEnd={async () => {
          try {
            await deactivateAssignment(selectedSession.id);
            addToast('Assignment ended.', 'success');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to end assignment',
              'error'
            );
            return;
          }
          unsubscribeFromSession();
          setSelectedSession(null);
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'manager',
              resultsSessionId: null,
            } as VideoActivityConfig,
          });
        }}
        onPause={async () => {
          try {
            await pauseAssignment(selectedSession.id);
            addToast('Assignment paused.', 'success');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to pause',
              'error'
            );
          }
        }}
        onResume={async () => {
          try {
            await resumeAssignment(selectedSession.id);
            addToast('Assignment resumed.', 'success');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to resume',
              'error'
            );
          }
        }}
        onUnlockStudent={unlockStudentAttempt}
        onBack={() => {
          unsubscribeFromSession();
          setSelectedSession(null);
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'manager',
              resultsSessionId: null,
            } as VideoActivityConfig,
          });
        }}
      />
    );
  }

  // Default: manager view (with editor modal rendered as sibling)
  return (
    <>
      <VideoActivityManager
        userId={user?.uid}
        assignmentMode={vaAssignmentMode}
        activities={activities}
        loading={loading}
        error={error}
        onNew={() => {
          const now = Date.now();
          setEditingActivity({
            id: crypto.randomUUID(),
            title: '',
            youtubeUrl: '',
            questions: [],
            createdAt: now,
            updatedAt: now,
          });
          setEditingMeta(null);
        }}
        onImport={() => setView('create')}
        onEdit={async (meta) => {
          const data = await loadActivity(meta);
          if (data) {
            setEditingActivity(data);
            setEditingMeta(meta);
          }
        }}
        defaultSessionSettings={defaultSessionSettings}
        rosters={rosters}
        onAssign={async (meta, rosterIds, dueAt) => {
          // Use loadActivityData directly to avoid setting loadingActivity
          // which would cause the Manager component to unmount and destroy the modal
          const data = await loadActivityData(meta.driveFileId);
          if (!data) throw new Error('Failed to load activity data');
          // Source behavior (sessionOptions, attemptLimit) from the activity
          // itself now that it lives on the activity (VA Task 9 parity).
          const behavior = getVideoActivityBehavior(meta);
          const sessionOptions: VideoActivitySessionOptions = {
            ...behavior.sessionOptions,
            attemptLimit: behavior.attemptLimit,
            ...(dueAt != null ? { dueAt } : {}),
          };
          // Auto-generate the assignment name from the activity title.
          const assignmentName = `${meta.title} - ${new Date().toLocaleString(
            [],
            {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            }
          )}`;
          // Resolve rosterIds against the current rosters and derive
          // ClassLink sourcedIds / period names / students in one shot.
          const selectedRosters = rosters.filter((r) =>
            rosterIds.includes(r.id)
          );
          const derived = deriveSessionTargetsFromRosters(selectedRosters);
          const sessionId = await createSession(
            data,
            user.uid,
            [],
            defaultSessionSettings,
            assignmentName,
            derived.classIds,
            derived.periodNames,
            derived.rosterIds,
            vaAssignmentMode,
            derived.classPeriodByClassId,
            sessionOptions
          );

          // Persist per-activity memory of the last roster selection so
          // subsequent launches pre-fill the picker.
          const prevMap = config.lastRosterIdsByActivityId ?? {};
          const nextMap: Record<string, string[]> = { ...prevMap };
          if (rosterIds.length > 0) {
            nextMap[meta.id] = rosterIds;
          } else {
            delete nextMap[meta.id];
          }

          updateWidget(widget.id, {
            config: {
              ...config,
              resultsSessionId: sessionId,
              lastRosterIdsByActivityId: nextMap,
            } as VideoActivityConfig,
          });

          const url = `${window.location.origin}/activity/${encodeURIComponent(sessionId)}`;
          const isViewOnly = vaAssignmentMode === 'view-only';
          await copyUrlToClipboard(url, addToast, {
            successMessage: isViewOnly
              ? 'Share link copied to clipboard!'
              : 'Assignment link copied to clipboard!',
            errorMessage: isViewOnly
              ? 'Share link created, but it could not be copied.'
              : 'Assignment created, but link could not be copied.',
          });
          return sessionId;
        }}
        lastRosterIdsByActivityId={config.lastRosterIdsByActivityId}
        lastClassIdsByActivityId={config.lastClassIdsByActivityId}
        lastClassIdByActivityId={config.lastClassIdByActivityId}
        onDelete={async (meta) => {
          try {
            await deleteActivity(meta.id, meta.driveFileId);
            addToast('Activity deleted.', 'success');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Delete failed',
              'error'
            );
          }
        }}
        onDuplicate={(meta) =>
          void duplicateBusy.run(meta.id, async () => {
            try {
              const copy = await duplicateActivity(meta);
              addToast(`Duplicated as "${copy.title}".`, 'success');
            } catch (err) {
              addToast(
                err instanceof Error ? err.message : 'Duplicate failed',
                'error'
              );
            }
          })
        }
        isDuplicating={duplicateBusy.isBusy}
        assignments={assignments}
        assignmentsLoading={assignmentsLoading}
        onArchiveCopyUrl={(assignment) => {
          const url = `${window.location.origin}/activity/${encodeURIComponent(assignment.id)}`;
          void copyUrlToClipboard(url, addToast, {
            successMessage: 'Link copied to clipboard!',
            errorMessage: 'Could not copy link.',
          });
        }}
        onArchivePauseResume={async (assignment) => {
          try {
            if (assignment.status === 'paused') {
              await resumeAssignment(assignment.id);
              addToast('Assignment resumed.', 'success');
            } else {
              await pauseAssignment(assignment.id);
              addToast('Assignment paused.', 'success');
            }
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to update status',
              'error'
            );
          }
        }}
        onArchiveDeactivate={async (assignment) => {
          // Branch the success toast on the assignment's frozen mode — for
          // view-only shares "Assignment" is the wrong noun and "submit" is
          // the wrong verb (no submissions exist).
          const isViewOnlyAssignment = assignment.mode === 'view-only';
          try {
            await deactivateAssignment(assignment.id);
            addToast(
              isViewOnlyAssignment ? 'Share ended.' : 'Assignment ended.',
              'success'
            );
          } catch (err) {
            addToast(
              err instanceof Error
                ? err.message
                : isViewOnlyAssignment
                  ? 'Failed to end share'
                  : 'Failed to end assignment',
              'error'
            );
          }
        }}
        onArchiveReactivate={async (assignment) => {
          try {
            await reactivateAssignment(assignment.id);
            addToast('Share reactivated.', 'success');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to reactivate share',
              'error'
            );
          }
        }}
        onArchiveDelete={async (assignment) => {
          try {
            await deleteAssignment(assignment.id);
            addToast('Assignment deleted.', 'success');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Delete failed',
              'error'
            );
          }
        }}
        onArchiveShare={async (assignment) => {
          // Hydrate the activity from Drive (Manager doesn't keep full
          // question content) so shareAssignment can inline the questions
          // into the share doc + canonical synced group.
          try {
            const data = await loadActivityData(assignment.activityDriveFileId);
            if (!data) {
              addToast('Could not load activity content for sharing.', 'error');
              return;
            }
            const url = await shareAssignment(assignment.id, data);
            await copyUrlToClipboard(url, addToast, {
              successMessage: 'Share link copied! Send it to a peer teacher.',
              errorMessage:
                'Share link created, but it could not be copied. Visit the assignment to grab the link.',
            });
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Share failed',
              'error'
            );
          }
        }}
        onArchiveResults={async (assignment) => {
          // Subscribe to the responses subcollection up-front so the listener
          // is live by the time Results mounts.
          subscribeToSession(assignment.id);
          // Hydrate the full session document — Results.tsx relies on
          // `session.questions` to compute scores/accuracy and to export.
          // Using a synthetic session with `questions: []` would render
          // empty or incorrect results even though the real session doc has
          // the full question set.
          try {
            const snap = await getDoc(
              doc(db, 'video_activity_sessions', assignment.id)
            );
            if (snap.exists()) {
              setSelectedSession(snap.data() as VideoActivitySession);
            } else {
              // Session doc missing (e.g. deleted) — fall back to a
              // minimal object so the empty-state rendering at least
              // shows the assignment context rather than crashing.
              setSelectedSession({
                id: assignment.id,
                activityId: assignment.activityId,
                activityTitle: assignment.activityTitle,
                assignmentName:
                  assignment.className ?? assignment.activityTitle,
                teacherUid: assignment.teacherUid,
                youtubeUrl: '',
                questions: [],
                settings: assignment.sessionSettings,
                status: assignment.status === 'active' ? 'active' : 'ended',
                allowedPins: [],
                createdAt: assignment.createdAt,
              });
              addToast(
                'Session data no longer available — showing limited results.',
                'info'
              );
            }
          } catch (err) {
            addToast(
              err instanceof Error
                ? err.message
                : 'Failed to load assignment results',
              'error'
            );
            return;
          }
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'results',
              selectedActivityId: assignment.activityId,
              selectedActivityTitle: assignment.activityTitle,
              resultsSessionId: assignment.id,
            } as VideoActivityConfig,
          });
        }}
        onArchiveMonitor={async (assignment) => {
          // Fetch the session doc up-front so we can confirm it exists
          // before arming the live listeners. Subscribing first would leak
          // an open Firestore listener on every error / missing-session
          // path here. The attempt token guards against a stale resolution
          // clobbering a newer click for a different assignment.
          const myAttempt = ++sessionLoadAttemptRef.current;
          let sessionDoc: VideoActivitySession;
          try {
            const snap = await getDoc(
              doc(db, 'video_activity_sessions', assignment.id)
            );
            if (myAttempt !== sessionLoadAttemptRef.current) return;
            if (!snap.exists()) {
              addToast(
                'Session data no longer available — cannot open monitor.',
                'error'
              );
              return;
            }
            sessionDoc = snap.data() as VideoActivitySession;
          } catch (err) {
            if (myAttempt !== sessionLoadAttemptRef.current) return;
            addToast(
              err instanceof Error
                ? err.message
                : 'Failed to open assignment monitor',
              'error'
            );
            return;
          }
          setSelectedSession(sessionDoc);
          subscribeToSession(assignment.id);
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'monitor',
              selectedActivityId: assignment.activityId,
              selectedActivityTitle: assignment.activityTitle,
              resultsSessionId: assignment.id,
            } as VideoActivityConfig,
          });
        }}
        onArchivePublishScores={(assignment) =>
          setPublishingAssignment(assignment)
        }
        onArchiveUnpublishScores={async (assignment) => {
          // One-click unpublish — `unpublishAssignmentScores` is a cheap
          // two-write batch (no Drive lookup, no grading).
          try {
            await unpublishAssignmentScores(assignment.id);
            addToast('Scores unpublished.', 'success');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to unpublish scores',
              'error'
            );
          }
        }}
        initialLibraryViewMode={config.libraryViewMode}
        onLibraryViewModeChange={(mode) => {
          updateWidget(widget.id, {
            config: { ...config, libraryViewMode: mode } as VideoActivityConfig,
          });
        }}
        onShareWithPlc={(meta) => {
          if (plcs.length === 0) {
            addToast(
              'Join a PLC from the My PLCs sidebar to share video activities with teammates.',
              'info'
            );
            return;
          }
          setShareWithPlcTarget(meta);
        }}
      />
      {publishingAssignment && (
        <PublishScoresModal
          assignmentTitle={
            publishingAssignment.className ?? publishingAssignment.activityTitle
          }
          currentVisibility={publishingAssignment.scoreVisibility}
          onClose={() => setPublishingAssignment(null)}
          onConfirm={async (visibility) => {
            const target = publishingAssignment;
            try {
              if (visibility === 'none') {
                await unpublishAssignmentScores(target.id);
                addToast('Scores unpublished.', 'success');
                setPublishingAssignment(null);
                return;
              }
              const data = await loadActivityData(target.activityDriveFileId);
              if (!data) {
                addToast(
                  'Activity content unavailable — cannot publish scores.',
                  'error'
                );
                return;
              }
              const result = await publishAssignmentScores(
                target.id,
                data,
                visibility
              );
              addToast(
                result.responsesUpdated > 0
                  ? `Scores published to ${result.responsesUpdated} student${result.responsesUpdated === 1 ? '' : 's'}.`
                  : 'Scores published. Students will see results once they submit.',
                'success'
              );
              setPublishingAssignment(null);
            } catch (err) {
              addToast(
                err instanceof Error ? err.message : 'Failed to publish scores',
                'error'
              );
            }
          }}
        />
      )}
      <VideoActivityEditorModal
        isOpen={!!editingActivity}
        activity={editingActivity}
        aiEnabled={aiEnabled}
        isAdmin={isAdmin === true}
        folders={editingMeta ? videoActivityFolders : undefined}
        folderId={editingMeta?.folderId ?? null}
        behavior={
          editingMeta ? getVideoActivityBehavior(editingMeta) : undefined
        }
        onFolderChange={
          editingMeta
            ? async (folderId) => {
                try {
                  await moveVideoActivityItem(editingMeta.id, folderId);
                  addToast('Folder updated.', 'success');
                } catch (err) {
                  addToast(
                    err instanceof Error
                      ? err.message
                      : 'Failed to update folder',
                    'error'
                  );
                }
              }
            : undefined
        }
        onClose={() => {
          setEditingActivity(null);
          setEditingMeta(null);
        }}
        onSave={async (updated, behavior) => {
          const isNew = !editingMeta;
          await saveActivity(updated, editingMeta?.driveFileId, behavior);
          addToast(
            isNew ? 'Activity created!' : 'Activity updated!',
            'success'
          );
        }}
      />
      {shareWithPlcTarget && (
        <PlcShareTargetModal
          plcs={plcs}
          quizTitle={shareWithPlcTarget.title}
          onConfirm={async (plcId) => {
            try {
              await handleShareWithPlc(shareWithPlcTarget, plcId);
              const plcName =
                plcs.find((p) => p.id === plcId)?.name ?? 'your PLC';
              addToast(`Shared with ${plcName}.`, 'success');
              setShareWithPlcTarget(null);
            } catch (err) {
              logError('VideoActivityWidget.shareWithPlc', err, {
                plcId,
                activityId: shareWithPlcTarget.id,
              });
              throw err instanceof Error
                ? err
                : new Error('Share with PLC failed.');
            }
          }}
          onClose={() => setShareWithPlcTarget(null)}
        />
      )}
    </>
  );
};
