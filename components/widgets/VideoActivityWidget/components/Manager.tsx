/**
 * Manager — teacher's video activity library view.
 * Lists all saved activities with actions: Edit, Assign, Results, Delete.
 */

import React, { useState, useMemo } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  BarChart3,
  PlayCircle,
  Loader2,
  AlertCircle,
  Link2,
  CheckCircle2,
  ExternalLink,
  X,
  Search,
  Pencil,
  Ban,
  Clock3,
  FileUp,
} from 'lucide-react';
import {
  VideoActivityMetadata,
  VideoActivitySessionSettings,
  VideoActivitySession,
} from '@/types';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Toggle } from '@/components/common/Toggle';

interface ManagerProps {
  activities: VideoActivityMetadata[];
  loading: boolean;
  error: string | null;
  onNew: () => void;
  onImport: () => void;
  onEdit: (activity: VideoActivityMetadata) => void;
  onResults: (activity: VideoActivityMetadata) => void;
  onCloseResults: () => void;
  onOpenSessionResults: (session: VideoActivitySession) => void;
  onRenameSession: (sessionId: string, assignmentName: string) => Promise<void>;
  onEndSession: (sessionId: string) => Promise<void>;
  onAssign: (
    activity: VideoActivityMetadata,
    settings: VideoActivitySessionSettings,
    assignmentName: string
  ) => Promise<string>;
  onDelete: (activity: VideoActivityMetadata) => void;
  defaultSessionSettings: VideoActivitySessionSettings;
  sessionResultsActivity: VideoActivityMetadata | null;
  activitySessions: VideoActivitySession[];
  sessionsLoading: boolean;
}

interface AssignModalProps {
  activity: VideoActivityMetadata;
  initialSettings: VideoActivitySessionSettings;
  onClose: () => void;
  onConfirm: (
    settings: VideoActivitySessionSettings,
    assignmentName: string
  ) => void;
  isCreating: boolean;
  error: string | null;
}

const buildDefaultAssignmentName = (title: string): string => {
  const formattedDate = new Date().toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${title} - ${formattedDate}`;
};

const AssignModal: React.FC<AssignModalProps> = ({
  activity,
  initialSettings,
  onClose,
  onConfirm,
  isCreating,
  error,
}) => {
  const [settings, setSettings] =
    useState<VideoActivitySessionSettings>(initialSettings);
  const [assignmentName, setAssignmentName] = useState(() =>
    buildDefaultAssignmentName(activity.title)
  );

  return (
    <div className="absolute inset-0 z-overlay bg-brand-blue-dark/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-brand-blue-primary p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Link2 className="w-5 h-5" />
            <span className="font-black uppercase tracking-tight">Assign</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-center">
            <p className="font-bold text-brand-blue-dark text-base truncate px-2">
              {activity.title}
            </p>
            <p
              className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
              style={{ fontSize: 'clamp(10px, 3cqmin, 12px)' }}
            >
              Create Session Link
            </p>
          </div>

          <p className="text-slate-600 text-sm text-center">
            Configure this session, then create a shareable student link.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
            <div>
              <label
                htmlFor="video-activity-assignment-name"
                className="block text-sm font-bold text-slate-700 mb-1.5"
              >
                Assignment Name
              </label>
              <input
                id="video-activity-assignment-name"
                type="text"
                value={assignmentName}
                onChange={(e) => setAssignmentName(e.target.value)}
                placeholder="1st period"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-brand-blue-primary"
              />
            </div>

            <div className="w-full h-px bg-slate-200" />

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-700">Auto-Play</p>
                <p className="text-xs text-slate-500">
                  Start video automatically after join
                </p>
              </div>
              <Toggle
                checked={settings.autoPlay}
                onChange={(checked) =>
                  setSettings((prev) => ({ ...prev, autoPlay: checked }))
                }
                size="sm"
                showLabels={false}
              />
            </div>

            <div className="w-full h-px bg-slate-200" />

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-700">
                  Require Correct Answers
                </p>
                <p className="text-xs text-slate-500">
                  Incorrect answers rewind to section start
                </p>
              </div>
              <Toggle
                checked={settings.requireCorrectAnswer}
                onChange={(checked) =>
                  setSettings((prev) => ({
                    ...prev,
                    requireCorrectAnswer: checked,
                  }))
                }
                size="sm"
                showLabels={false}
              />
            </div>

            <div className="w-full h-px bg-slate-200" />

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-700">
                  Allow Skipping
                </p>
                <p className="text-xs text-slate-500">
                  Let students scrub ahead
                </p>
              </div>
              <Toggle
                checked={settings.allowSkipping}
                onChange={(checked) =>
                  setSettings((prev) => ({ ...prev, allowSkipping: checked }))
                }
                size="sm"
                showLabels={false}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-brand-red-primary text-center font-medium">
              {error}
            </p>
          )}
          <div className="grid gap-3">
            <button
              onClick={() => onConfirm(settings, assignmentName.trim())}
              disabled={isCreating || assignmentName.trim().length === 0}
              className="w-full flex items-center justify-center gap-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95 shadow-sm py-3 text-sm disabled:opacity-60"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              {isCreating ? 'Creating…' : 'Create Session Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SessionLinkModalProps {
  sessionId: string;
  assignmentName: string;
  onClose: () => void;
}

const SessionLinkModal: React.FC<SessionLinkModalProps> = ({
  sessionId,
  assignmentName,
  onClose,
}) => {
  const link = `${window.location.origin}/activity/${sessionId}`;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="absolute inset-0 z-overlay bg-brand-blue-dark/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-emerald-600 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-black uppercase tracking-tight">
              Session Created
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-center">
            <p className="font-bold text-brand-blue-dark text-base truncate px-2">
              {assignmentName}
            </p>
          </div>
          <p className="text-slate-600 text-sm text-center">
            Share this link with your students. They&apos;ll enter their PIN to
            join.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 break-all text-xs text-slate-700 font-mono">
            {link}
          </div>

          <div className="grid gap-2">
            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95 shadow-sm py-3 text-sm"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  Copy Link
                </>
              )}
            </button>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors py-3 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Open in New Tab
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ResultsModalProps {
  activity: VideoActivityMetadata;
  sessions: VideoActivitySession[];
  loading: boolean;
  onClose: () => void;
  onOpenSessionResults: (session: VideoActivitySession) => void;
  onRenameSession: (sessionId: string, assignmentName: string) => Promise<void>;
  onEndSession: (sessionId: string) => Promise<void>;
}

const ResultsModal: React.FC<ResultsModalProps> = ({
  activity,
  sessions,
  loading,
  onClose,
  onOpenSessionResults,
  onRenameSession,
  onEndSession,
}) => {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null);
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCopy = async (sessionId: string) => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/activity/${sessionId}`
    );
  };

  const handleSaveRename = async (sessionId: string) => {
    if (!draftName.trim()) return;
    setSavingSessionId(sessionId);
    setActionError(null);
    try {
      await onRenameSession(sessionId, draftName.trim());
      setEditingSessionId(null);
      setDraftName('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setSavingSessionId(null);
    }
  };

  const handleEndSession = async (sessionId: string) => {
    setSavingSessionId(sessionId);
    setActionError(null);
    try {
      await onEndSession(sessionId);
      setConfirmEndId(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to end session'
      );
    } finally {
      setSavingSessionId(null);
    }
  };

  return (
    <div className="absolute inset-0 z-overlay bg-brand-blue-dark/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <div className="bg-violet-600 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white min-w-0">
            <BarChart3 className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-black uppercase tracking-tight">Results</p>
              <p className="text-white/80 text-xs truncate">{activity.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close results"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {actionError && (
            <p className="text-sm text-brand-red-primary font-medium">
              {actionError}
            </p>
          )}

          {loading ? (
            <div className="py-10 flex items-center justify-center text-brand-blue-primary">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <p className="font-bold text-slate-700">No assignments yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Create an assignment to generate a reusable student link and
                results history for this activity.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const isEditing = editingSessionId === session.id;
                const isSaving = savingSessionId === session.id;
                const link = `${window.location.origin}/activity/${session.id}`;

                return (
                  <div
                    key={session.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={draftName}
                              onChange={(e) => setDraftName(e.target.value)}
                              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-brand-blue-primary"
                            />
                            <button
                              onClick={() => void handleSaveRename(session.id)}
                              disabled={
                                isSaving || draftName.trim().length === 0
                              }
                              className="rounded-xl bg-brand-blue-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingSessionId(null);
                                setDraftName('');
                              }}
                              className="rounded-xl bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="font-bold text-brand-blue-dark truncate">
                              {session.assignmentName}
                            </p>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-widest ${
                                session.status === 'ended'
                                  ? 'bg-slate-200 text-slate-600'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {session.status}
                            </span>
                          </div>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="w-3 h-3" />
                            {new Date(session.createdAt).toLocaleString()}
                          </span>
                          <span className="opacity-30">•</span>
                          <span className="truncate">{link}</span>
                        </div>
                      </div>
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingSessionId(session.id);
                            setDraftName(session.assignmentName);
                          }}
                          className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-100"
                          title="Rename assignment"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Pencil className="w-3 h-3" />
                            Rename
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => onOpenSessionResults(session)}
                        className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700"
                      >
                        Open Results
                      </button>
                      <button
                        onClick={() => void handleCopy(session.id)}
                        className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-100"
                      >
                        Copy Link
                      </button>
                      {session.status === 'active' ? (
                        confirmEndId === session.id ? (
                          <>
                            <button
                              onClick={() => void handleEndSession(session.id)}
                              disabled={isSaving}
                              className="rounded-xl bg-brand-red-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                            >
                              Confirm End
                            </button>
                            <button
                              onClick={() => setConfirmEndId(null)}
                              className="rounded-xl bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmEndId(session.id)}
                            className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 border border-amber-200 hover:bg-amber-100"
                          >
                            <span className="inline-flex items-center gap-1">
                              <Ban className="w-3 h-3" />
                              End Session
                            </span>
                          </button>
                        )
                      ) : (
                        <span className="rounded-xl bg-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
                          Closed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const Manager: React.FC<ManagerProps> = ({
  activities,
  loading,
  error,
  onNew,
  onImport,
  onEdit,
  onResults,
  onCloseResults,
  onOpenSessionResults,
  onRenameSession,
  onEndSession,
  onAssign,
  onDelete,
  defaultSessionSettings,
  sessionResultsActivity,
  activitySessions,
  sessionsLoading,
}) => {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] =
    useState<VideoActivityMetadata | null>(null);
  const [createdSession, setCreatedSession] = useState<{
    id: string;
    assignmentName: string;
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredActivities = useMemo(() => {
    if (!searchQuery.trim()) return activities;
    const low = searchQuery.toLowerCase();
    return activities.filter((a) => a.title.toLowerCase().includes(low));
  }, [activities, searchQuery]);

  const handleAssignConfirm = async (
    settings: VideoActivitySessionSettings,
    assignmentName: string
  ) => {
    if (!assignTarget) return;
    setIsCreating(true);
    setAssignError(null);
    try {
      const sessionId = await onAssign(assignTarget, settings, assignmentName);
      setAssignTarget(null);
      setCreatedSession({ id: sessionId, assignmentName });
    } catch (err) {
      setAssignError(
        err instanceof Error ? err.message : 'Failed to create session'
      );
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-brand-blue-primary"
        style={{ gap: 'min(12px, 3cqmin)' }}
      >
        <Loader2
          className="animate-spin"
          style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
        />
        <span
          style={{ fontSize: 'clamp(12px, 4cqmin, 14px)', fontWeight: 500 }}
        >
          Loading activities…
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-sans relative">
      {/* Assign modal */}
      {assignTarget && (
        <AssignModal
          activity={assignTarget}
          initialSettings={defaultSessionSettings}
          onClose={() => {
            if (!isCreating) {
              setAssignTarget(null);
              setAssignError(null);
            }
          }}
          onConfirm={handleAssignConfirm}
          isCreating={isCreating}
          error={assignError}
        />
      )}

      {/* Session link modal */}
      {createdSession && (
        <SessionLinkModal
          sessionId={createdSession.id}
          assignmentName={createdSession.assignmentName}
          onClose={() => setCreatedSession(null)}
        />
      )}

      {sessionResultsActivity && (
        <ResultsModal
          activity={sessionResultsActivity}
          sessions={activitySessions}
          loading={sessionsLoading}
          onClose={onCloseResults}
          onOpenSessionResults={onOpenSessionResults}
          onRenameSession={onRenameSession}
          onEndSession={onEndSession}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between border-b border-brand-blue-primary/10 bg-brand-blue-lighter/30 flex-shrink-0 shadow-sm"
        style={{
          padding: 'min(12px, 3cqmin) min(16px, 4cqmin) min(10px, 2.5cqmin)',
          gap: 'min(8px, 2cqmin)',
        }}
      >
        <div
          className="flex items-center"
          style={{ gap: 'min(10px, 2.5cqmin)' }}
        >
          <div
            className="bg-brand-red-primary text-white flex items-center justify-center rounded-lg shadow-sm"
            style={{ width: 'min(28px, 7cqmin)', height: 'min(28px, 7cqmin)' }}
          >
            <PlayCircle
              style={{
                width: 'min(16px, 4cqmin)',
                height: 'min(16px, 4cqmin)',
              }}
            />
          </div>
          <div className="flex flex-col">
            <span
              className="font-black text-brand-blue-dark uppercase tracking-tight"
              style={{ fontSize: 'clamp(13px, 4cqmin, 15px)' }}
            >
              Video Activities
            </span>
            <span
              className="text-brand-blue-primary/60 font-bold"
              style={{ fontSize: 'clamp(10px, 2.5cqmin, 11px)' }}
            >
              {activities.length} total • Interactive Lessons
            </span>
          </div>
        </div>
        <div
          className="flex items-center"
          style={{ gap: 'min(6px, 1.5cqmin)' }}
        >
          <button
            onClick={onImport}
            className="flex items-center bg-white hover:bg-brand-blue-lighter/40 text-brand-blue-primary font-bold rounded-xl transition-all active:scale-95 shadow-sm border border-brand-blue-primary/20"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
              fontSize: 'clamp(11px, 3cqmin, 12px)',
            }}
            title="Import from CSV, Google Sheet, or AI"
          >
            <FileUp
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
            Import
          </button>
          <button
            onClick={onNew}
            className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-black rounded-xl transition-all active:scale-95 shadow-lg shadow-brand-blue-primary/20"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(8px, 2cqmin) min(14px, 3.5cqmin)',
              fontSize: 'clamp(11px, 3cqmin, 12px)',
            }}
          >
            <Plus
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
            New
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar flex flex-col"
        style={{ padding: 'min(12px, 3cqmin)' }}
      >
        {/* Search Bar */}
        {activities.length > 0 && (
          <div
            className="relative group flex-shrink-0"
            style={{ marginBottom: 'min(12px, 3cqmin)' }}
          >
            <Search
              className="absolute text-brand-blue-primary/40 group-focus-within:text-brand-blue-primary transition-colors"
              style={{
                left: 'min(12px, 3cqmin)',
                top: '50%',
                transform: 'translateY(-50%)',
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
            <input
              type="text"
              placeholder="Search activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-brand-blue-primary/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 text-brand-blue-dark placeholder:text-brand-blue-primary/30"
              style={{
                padding:
                  'min(8px, 2cqmin) min(12px, 3cqmin) min(8px, 2cqmin) min(34px, 8cqmin)',
                fontSize: 'clamp(12px, 3.5cqmin, 13px)',
              }}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="flex items-center bg-brand-red-lighter/40 border border-brand-red-primary/30 rounded-xl text-brand-red-dark mb-3"
            style={{
              padding: 'min(10px, 2.5cqmin)',
              gap: 'min(8px, 2cqmin)',
              fontSize: 'clamp(11px, 3.5cqmin, 12px)',
              fontWeight: 500,
            }}
          >
            <AlertCircle
              className="shrink-0"
              style={{
                width: 'min(16px, 4.5cqmin)',
                height: 'min(16px, 4.5cqmin)',
              }}
            />
            {error}
          </div>
        )}

        {/* List or Empty State */}
        {activities.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <ScaledEmptyState
              icon={PlayCircle}
              title="No Activities"
              subtitle="Create your first interactive video activity to get started."
              action={
                <button
                  type="button"
                  onClick={onNew}
                  className="inline-flex items-center justify-center rounded-xl bg-brand-blue-primary text-white font-bold shadow-sm hover:bg-brand-blue-dark transition-colors"
                  style={{
                    fontSize: 'clamp(11px, 3.25cqmin, 12px)',
                    padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
                  }}
                >
                  Create Activity
                </button>
              }
            />
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <p
              className="text-slate-400 font-bold"
              style={{ fontSize: 'clamp(12px, 4cqmin, 14px)' }}
            >
              No matches for &quot;{searchQuery}&quot;
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredActivities.map((activity) => (
              <div
                key={activity.id}
                className="group bg-white border border-brand-blue-primary/10 rounded-xl shadow-sm hover:shadow-md hover:border-brand-blue-primary/20 transition-all flex items-center"
                style={{
                  padding: 'min(10px, 2.5cqmin)',
                  gap: 'min(12px, 3cqmin)',
                }}
              >
                {/* Icon */}
                <div
                  className="bg-brand-red-lighter/50 text-brand-red-primary rounded-lg flex items-center justify-center shrink-0 border border-brand-red-primary/10"
                  style={{
                    width: 'min(40px, 10cqmin)',
                    height: 'min(40px, 10cqmin)',
                  }}
                >
                  <PlayCircle
                    style={{
                      width: 'min(20px, 5cqmin)',
                      height: 'min(20px, 5cqmin)',
                    }}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div
                    className="flex items-center"
                    style={{ gap: 'min(6px, 1.5cqmin)' }}
                  >
                    <h3
                      className="font-bold text-brand-blue-dark truncate"
                      style={{ fontSize: 'clamp(12px, 4cqmin, 14px)' }}
                    >
                      {activity.title}
                    </h3>
                    <span
                      className="bg-brand-red-lighter text-brand-red-primary font-black uppercase tracking-widest rounded-md shrink-0"
                      style={{
                        fontSize: 'clamp(10px, 2cqmin, 11px)',
                        padding: 'min(1px, 0.2cqmin) min(6px, 1.5cqmin)',
                      }}
                    >
                      {activity.questionCount} Qs
                    </span>
                  </div>
                  <div
                    className="flex items-center text-brand-gray-primary font-medium"
                    style={{
                      gap: 'min(8px, 2cqmin)',
                      fontSize: 'clamp(10px, 3cqmin, 11px)',
                      marginTop: 'min(1px, 0.2cqmin)',
                    }}
                  >
                    <span className="truncate max-w-[120px] hidden sm:inline opacity-60">
                      {activity.youtubeUrl}
                    </span>
                    {activity.youtubeUrl && (
                      <span className="hidden sm:inline opacity-20">•</span>
                    )}
                    <span className="shrink-0 opacity-60">
                      {new Date(
                        activity.updatedAt || activity.createdAt
                      ).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div
                  className="flex items-center"
                  style={{ gap: 'min(6px, 1.5cqmin)' }}
                >
                  {confirmDelete === activity.id ? (
                    <div
                      className="flex items-center bg-brand-red-lighter/30 rounded-lg overflow-hidden"
                      style={{ gap: '1px' }}
                    >
                      <button
                        onClick={() => {
                          setConfirmDelete(null);
                          onDelete(activity);
                        }}
                        className="bg-brand-red-primary hover:bg-brand-red-dark text-white font-bold transition-colors"
                        style={{
                          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                          fontSize: 'clamp(10px, 2.5cqmin, 11px)',
                        }}
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition-colors"
                        style={{
                          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                          fontSize: 'clamp(10px, 2.5cqmin, 11px)',
                        }}
                      >
                        Esc
                      </button>
                    </div>
                  ) : (
                    <>
                      <ActionButton
                        icon={<BarChart3 />}
                        label="Results"
                        onClick={() => onResults(activity)}
                        color="bg-violet-50 text-violet-600 hover:bg-violet-100"
                      />
                      <ActionButton
                        icon={<Link2 />}
                        label="Assign"
                        onClick={() => setAssignTarget(activity)}
                        color="bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                      />
                      <div
                        className="flex items-center border-l border-slate-100"
                        style={{
                          paddingLeft: 'min(6px, 1.5cqmin)',
                          gap: 'min(4px, 1cqmin)',
                        }}
                      >
                        <button
                          onClick={() => onEdit(activity)}
                          className="text-slate-400 hover:text-brand-blue-primary p-1.5 hover:bg-slate-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2
                            style={{
                              width: 'min(14px, 3.5cqmin)',
                              height: 'min(14px, 3.5cqmin)',
                            }}
                          />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(activity.id)}
                          className="text-slate-400 hover:text-brand-red-primary p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2
                            style={{
                              width: 'min(14px, 3.5cqmin)',
                              height: 'min(14px, 3.5cqmin)',
                            }}
                          />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color: string;
}> = ({ icon, label, onClick, color }) => (
  <button
    onClick={onClick}
    className={`flex items-center font-bold rounded-lg transition-all active:scale-95 shadow-sm ${color}`}
    style={{
      gap: 'clamp(4px, 1cqmin, 6px)',
      padding: 'clamp(6px, 1.5cqmin, 8px) clamp(10px, 2.5cqmin, 12px)',
      fontSize: 'clamp(10px, 3cqmin, 11px)',
    }}
  >
    {React.cloneElement(
      icon as React.ReactElement<React.HTMLAttributes<HTMLElement>>,
      {
        style: {
          width: 'min(12px, 3cqmin)',
          height: 'min(12px, 3cqmin)',
        },
      }
    )}
    <span className="hidden sm:inline">{label}</span>
  </button>
);
