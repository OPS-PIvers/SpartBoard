/**
 * VideoActivityWidget — main orchestrator component.
 * Manages view state (manager / create / results) and the editor modal.
 * The question-authoring editor lives in VideoActivityEditorModal, rendered
 * as a sibling of the Manager library view.
 */

import React, { useState, useCallback } from 'react';
import {
  WidgetData,
  VideoActivityConfig,
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
import { Manager } from './components/Manager';
import { Creator } from './components/Creator';
import { Results } from './components/Results';
import { VideoActivityEditorModal } from './components/VideoActivityEditorModal';
import { Loader2, AlertTriangle, LogIn } from 'lucide-react';

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
    sessions,
    sessionsLoading,
    subscribeToActivitySessions,
    unsubscribeFromActivitySessions,
    renameSession,
    endSession,
    responses,
    subscribeToSession,
    unsubscribeFromSession,
  } = useVideoActivitySessionTeacher();

  const [loadingActivity, setLoadingActivity] = useState(false);
  const [selectedSession, setSelectedSession] =
    useState<VideoActivitySession | null>(null);
  const [resultsActivity, setResultsActivity] =
    useState<VideoActivityMetadata | null>(null);

  // Editor modal state — ephemeral, not persisted to Firestore.
  const [editingActivity, setEditingActivity] =
    useState<VideoActivityData | null>(null);
  const [editingMeta, setEditingMeta] = useState<VideoActivityMetadata | null>(
    null
  );

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

  const view = config.view ?? 'manager';
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
      <Manager
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
        sessionResultsActivity={resultsActivity}
        activitySessions={sessions}
        sessionsLoading={sessionsLoading}
        onResults={(meta) => {
          setResultsActivity(meta);
          subscribeToActivitySessions(meta.id, user.uid);
        }}
        onCloseResults={() => {
          setResultsActivity(null);
          unsubscribeFromActivitySessions();
        }}
        onOpenSessionResults={(session) => {
          subscribeToSession(session.id);
          setSelectedSession(session);
          setResultsActivity(null);
          unsubscribeFromActivitySessions();
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'results',
              selectedActivityId: session.activityId,
              selectedActivityTitle: session.activityTitle,
              resultsSessionId: session.id,
            } as VideoActivityConfig,
          });
        }}
        onRenameSession={renameSession}
        onEndSession={endSession}
        defaultSessionSettings={defaultSessionSettings}
        onAssign={async (meta, sessionSettings, assignmentName) => {
          // Use loadActivityData directly to avoid setting loadingActivity
          // which would cause the Manager component to unmount and destroy the modal
          const data = await loadActivityData(meta.driveFileId);
          if (!data) throw new Error('Failed to load activity data');
          const sessionId = await createSession(
            data,
            user.uid,
            [],
            sessionSettings,
            assignmentName
          );
          updateWidget(widget.id, {
            config: {
              ...config,
              resultsSessionId: sessionId,
            } as VideoActivityConfig,
          });

          const url = `${window.location.origin}/activity/${encodeURIComponent(sessionId)}`;
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            void navigator.clipboard
              .writeText(url)
              .then(() =>
                addToast('Assignment link copied to clipboard!', 'success')
              )
              .catch(() =>
                addToast(
                  'Assignment created, but link could not be copied.',
                  'info'
                )
              );
          } else {
            addToast(
              'Assignment created, but link could not be copied.',
              'info'
            );
          }
          return sessionId;
        }}
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
      />
      <VideoActivityEditorModal
        isOpen={!!editingActivity}
        activity={editingActivity}
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
