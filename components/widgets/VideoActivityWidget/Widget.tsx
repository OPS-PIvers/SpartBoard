/**
 * VideoActivityWidget — main orchestrator component.
 * Manages view state (manager / create / results) and the editor modal.
 * The question-authoring editor lives in VideoActivityEditorModal, rendered
 * as a sibling of the Manager library view.
 */

import React, { useState, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  WidgetData,
  VideoActivityConfig,
  VideoActivityView,
  VideoActivityMetadata,
  VideoActivityData,
  VideoActivitySessionSettings,
  VideoActivityGlobalConfig,
  VideoActivitySession,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { useVideoActivitySessionTeacher } from '@/hooks/useVideoActivitySession';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import { useFolders } from '@/hooks/useFolders';
import { VideoActivityManager } from './components/VideoActivityManager';
import { Creator } from './components/Creator';
import { Results } from './components/Results';
import { VideoActivityEditorModal } from './components/VideoActivityEditorModal';
import { Loader2, AlertTriangle, LogIn } from 'lucide-react';

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
  const { updateWidget, addToast } = useDashboard();
  const {
    user,
    googleAccessToken,
    isAdmin,
    canAccessFeature,
    featurePermissions,
  } = useAuth();
  const config = widget.config as VideoActivityConfig;

  const {
    activities,
    loading,
    error,
    saveActivity,
    loadActivityData,
    deleteActivity,
    createTemplateSheet,
    isDriveConnected,
  } = useVideoActivity(user?.uid);

  const {
    createSession,
    responses,
    subscribeToSession,
    unsubscribeFromSession,
  } = useVideoActivitySessionTeacher();

  const {
    assignments,
    loading: assignmentsLoading,
    pauseAssignment,
    resumeAssignment,
    deactivateAssignment,
    deleteAssignment,
  } = useVideoActivityAssignments(user?.uid);

  const [loadingActivity, setLoadingActivity] = useState(false);
  const [selectedSession, setSelectedSession] =
    useState<VideoActivitySession | null>(null);

  // Editor modal state — ephemeral, not persisted to Firestore.
  const [editingActivity, setEditingActivity] =
    useState<VideoActivityData | null>(null);
  const [editingMeta, setEditingMeta] = useState<VideoActivityMetadata | null>(
    null
  );

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

  // ─── Guards ────────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-slate-400 text-center"
        style={{ gap: 'min(12px, 3cqmin)', padding: 'min(24px, 6cqmin)' }}
      >
        <LogIn
          className="opacity-40"
          style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
        />
        <p
          className="font-medium text-slate-300"
          style={{ fontSize: 'min(13px, 4.5cqmin)' }}
        >
          Sign in required
        </p>
        <p
          className="text-slate-500"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          Sign in with Google to use Video Activities.
        </p>
      </div>
    );
  }

  if (!isDriveConnected && !googleAccessToken) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-slate-400 text-center"
        style={{ gap: 'min(12px, 3cqmin)', padding: 'min(24px, 6cqmin)' }}
      >
        <AlertTriangle
          className="opacity-40"
          style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
        />
        <p
          className="font-medium text-slate-300"
          style={{ fontSize: 'min(13px, 4.5cqmin)' }}
        >
          Drive access needed
        </p>
        <p
          className="text-slate-500"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          Sign out and sign in again to grant Google Drive access.
        </p>
      </div>
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
    return (
      <Results
        session={selectedSession}
        responses={responses}
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
        onAssign={async (meta, sessionSettings, assignmentName, classId) => {
          // Use loadActivityData directly to avoid setting loadingActivity
          // which would cause the Manager component to unmount and destroy the modal
          const data = await loadActivityData(meta.driveFileId);
          if (!data) throw new Error('Failed to load activity data');
          const sessionId = await createSession(
            data,
            user.uid,
            [],
            sessionSettings,
            assignmentName,
            classId ?? undefined
          );

          // Phase 3B: persist per-activity memory of the last ClassLink target
          // so the next launch of the same activity pre-selects the class the
          // teacher used last time. Clearing the selection ("No class") also
          // clears the remembered id so we don't stick on stale values.
          const prevMap = config.lastClassIdByActivityId ?? {};
          const nextMap: Record<string, string> = { ...prevMap };
          if (classId) {
            nextMap[meta.id] = classId;
          } else {
            delete nextMap[meta.id];
          }

          updateWidget(widget.id, {
            config: {
              ...config,
              resultsSessionId: sessionId,
              lastClassIdByActivityId: nextMap,
            } as VideoActivityConfig,
          });

          const url = `${window.location.origin}/activity/${encodeURIComponent(sessionId)}`;
          await copyUrlToClipboard(url, addToast, {
            successMessage: 'Assignment link copied to clipboard!',
            errorMessage: 'Assignment created, but link could not be copied.',
          });
          return sessionId;
        }}
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
          try {
            await deactivateAssignment(assignment.id);
            addToast('Assignment ended.', 'success');
          } catch (err) {
            addToast(
              err instanceof Error ? err.message : 'Failed to end assignment',
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
        initialLibraryViewMode={config.libraryViewMode}
        onLibraryViewModeChange={(mode) => {
          updateWidget(widget.id, {
            config: { ...config, libraryViewMode: mode } as VideoActivityConfig,
          });
        }}
      />
      <VideoActivityEditorModal
        isOpen={!!editingActivity}
        activity={editingActivity}
        aiEnabled={aiEnabled}
        isAdmin={isAdmin === true}
        folders={editingMeta ? videoActivityFolders : undefined}
        folderId={editingMeta?.folderId ?? null}
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
        onSave={async (updated) => {
          const isNew = !editingMeta;
          await saveActivity(updated, editingMeta?.driveFileId);
          addToast(
            isNew ? 'Activity created!' : 'Activity updated!',
            'success'
          );
        }}
      />
    </>
  );
};
