/**
 * VideoActivityWidget — main orchestrator component.
 * Manages view state (manager / create / editor / results) and hooks.
 */

import React, { useState, useCallback } from 'react';
import {
  WidgetData,
  VideoActivityConfig,
  VideoActivityMetadata,
  VideoActivityData,
  VideoActivitySessionSettings,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { useVideoActivitySessionTeacher } from '@/hooks/useVideoActivitySession';
import { Manager } from './components/Manager';
import { Creator } from './components/Creator';
import { Editor } from './components/Editor';
import { Results } from './components/Results';
import { Loader2, AlertTriangle, LogIn } from 'lucide-react';

export const VideoActivityWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast } = useDashboard();
  const { user, googleAccessToken, isAdmin, canAccessFeature } = useAuth();
  const config = widget.config as VideoActivityConfig;

  const {
    activities,
    loading,
    error,
    saveActivity,
    loadActivityData,
    deleteActivity,
    isDriveConnected,
  } = useVideoActivity(user?.uid);

  const {
    createSession,
    responses,
    subscribeToSession,
    unsubscribeFromSession,
  } = useVideoActivitySessionTeacher();

  const [loadedActivity, setLoadedActivity] =
    useState<VideoActivityData | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [selectedMeta, setSelectedMeta] =
    useState<VideoActivityMetadata | null>(null);

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
        setLoadedActivity(data);
        setSelectedMeta(meta);
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
        audioTranscriptionEnabled={audioTranscriptionEnabled}
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

  if (view === 'editor' && loadedActivity) {
    return (
      <Editor
        activity={loadedActivity}
        onBack={() => {
          setLoadedActivity(null);
          setView('manager');
        }}
        onSave={async (updated) => {
          await saveActivity(updated, selectedMeta?.driveFileId);
          setLoadedActivity(updated);
          addToast('Activity updated!', 'success');
          setView('manager');
        }}
      />
    );
  }

  if (view === 'results' && loadedActivity) {
    return (
      <Results
        activity={loadedActivity}
        responses={responses}
        onBack={() => {
          unsubscribeFromSession();
          setLoadedActivity(null);
          setView('manager');
        }}
      />
    );
  }

  // Default: manager view
  return (
    <Manager
      activities={activities}
      loading={loading}
      error={error}
      onNew={() => setView('create')}
      onEdit={async (meta) => {
        const data = await loadActivity(meta);
        if (data) setView('editor');
      }}
      onResults={async (meta) => {
        const data = await loadActivity(meta);
        if (data) {
          const sessionId = config.resultsSessionId;
          if (sessionId) {
            subscribeToSession(sessionId);
          }
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'results',
              selectedActivityId: meta.id,
              selectedActivityTitle: meta.title,
            } as VideoActivityConfig,
          });
        }
      }}
      defaultSessionSettings={defaultSessionSettings}
      onAssign={async (meta, sessionSettings) => {
        // Use loadActivityData directly to avoid setting loadingActivity
        // which would cause the Manager component to unmount and destroy the modal
        const data = await loadActivityData(meta.driveFileId);
        if (!data) throw new Error('Failed to load activity data');
        const sessionId = await createSession(
          data,
          user.uid,
          [],
          sessionSettings
        );
        updateWidget(widget.id, {
          config: {
            ...config,
            resultsSessionId: sessionId,
          } as VideoActivityConfig,
        });
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
  );
};
