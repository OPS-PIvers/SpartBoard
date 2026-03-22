/**
 * Manager — teacher's video activity library view.
 * Lists all saved activities with actions: Edit, Assign, Results, Delete.
 */

import React, { useState } from 'react';
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
} from 'lucide-react';
import { VideoActivityMetadata } from '@/types';

interface ManagerProps {
  activities: VideoActivityMetadata[];
  loading: boolean;
  error: string | null;
  onNew: () => void;
  onEdit: (activity: VideoActivityMetadata) => void;
  onResults: (activity: VideoActivityMetadata) => void;
  onAssign: (activity: VideoActivityMetadata) => Promise<string>;
  onDelete: (activity: VideoActivityMetadata) => void;
}

interface AssignModalProps {
  activity: VideoActivityMetadata;
  onClose: () => void;
  onConfirm: () => void;
  isCreating: boolean;
  error: string | null;
}

const AssignModal: React.FC<AssignModalProps> = ({
  activity,
  onClose,
  onConfirm,
  isCreating,
  error,
}) => {
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
              style={{ fontSize: 'min(10px, 3cqmin)' }}
            >
              Create Session Link
            </p>
          </div>

          <p className="text-slate-600 text-sm text-center">
            Click &quot;Create Link&quot; to generate a shareable session.
            Students open the link and enter their roster PIN to join.
          </p>

          {error && (
            <p className="text-sm text-brand-red-primary text-center font-medium">
              {error}
            </p>
          )}
          <div className="grid gap-3">
            <button
              onClick={onConfirm}
              disabled={isCreating}
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
  onClose: () => void;
}

const SessionLinkModal: React.FC<SessionLinkModalProps> = ({
  sessionId,
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

export const Manager: React.FC<ManagerProps> = ({
  activities,
  loading,
  error,
  onNew,
  onEdit,
  onResults,
  onAssign,
  onDelete,
}) => {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] =
    useState<VideoActivityMetadata | null>(null);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const handleAssignConfirm = async () => {
    if (!assignTarget) return;
    setIsCreating(true);
    setAssignError(null);
    try {
      const sessionId = await onAssign(assignTarget);
      setAssignTarget(null);
      setCreatedSessionId(sessionId);
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
        <span style={{ fontSize: 'min(14px, 4cqmin)', fontWeight: 500 }}>
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
      {createdSessionId && (
        <SessionLinkModal
          sessionId={createdSessionId}
          onClose={() => setCreatedSessionId(null)}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between border-b border-brand-blue-primary/10 bg-brand-blue-lighter/30"
        style={{ padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)' }}
      >
        <div className="flex items-center" style={{ gap: 'min(8px, 2cqmin)' }}>
          <div
            className="bg-brand-red-primary text-white flex items-center justify-center rounded-lg"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          >
            <PlayCircle
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
          </div>
          <div className="flex flex-col">
            <span
              className="font-bold text-brand-blue-dark leading-none"
              style={{ fontSize: 'min(14px, 4.5cqmin)' }}
            >
              Video Activities
            </span>
            <span
              className="text-brand-blue-primary/70 font-medium"
              style={{ fontSize: 'min(11px, 3cqmin)' }}
            >
              {activities.length} saved{' '}
              {activities.length === 1 ? 'activity' : 'activities'}
            </span>
          </div>
        </div>
        <button
          onClick={onNew}
          className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all shadow-sm active:scale-95"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
            fontSize: 'min(12px, 3.5cqmin)',
          }}
        >
          <Plus
            style={{
              width: 'min(14px, 4cqmin)',
              height: 'min(14px, 4cqmin)',
            }}
          />
          New Activity
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center bg-brand-red-lighter/40 border border-brand-red-primary/30 rounded-xl text-brand-red-dark"
          style={{
            margin: 'min(12px, 2.5cqmin) min(16px, 4cqmin) 0',
            padding: 'min(10px, 2.5cqmin)',
            gap: 'min(8px, 2cqmin)',
            fontSize: 'min(11px, 3.5cqmin)',
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

      {/* Activity list */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(16px, 4cqmin)' }}
      >
        {activities.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full text-brand-blue-primary/40 py-12"
            style={{ gap: 'min(16px, 4cqmin)' }}
          >
            <div
              className="bg-brand-blue-lighter/50 p-6 rounded-full border-2 border-dashed border-brand-blue-primary/20"
              style={{ padding: 'min(24px, 6cqmin)' }}
            >
              <PlayCircle
                style={{
                  width: 'min(48px, 12cqmin)',
                  height: 'min(48px, 12cqmin)',
                }}
              />
            </div>
            <div className="text-center">
              <p
                className="font-bold text-brand-blue-primary"
                style={{ fontSize: 'min(15px, 5cqmin)' }}
              >
                No activities yet
              </p>
              <p
                className="text-brand-blue-primary/60 font-medium"
                style={{
                  fontSize: 'min(12px, 3.5cqmin)',
                  marginTop: 'min(4px, 1cqmin)',
                  maxWidth: '200px',
                }}
              >
                Paste a YouTube URL to create your first AI-powered activity
              </p>
            </div>
            <button
              onClick={onNew}
              className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-2xl transition-all shadow-md active:scale-95"
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(10px, 2.5cqmin) min(20px, 5cqmin)',
                fontSize: 'min(14px, 4.5cqmin)',
              }}
            >
              <Plus
                style={{
                  width: 'min(18px, 4.5cqmin)',
                  height: 'min(18px, 4.5cqmin)',
                }}
              />
              Create First Activity
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="bg-white border border-brand-blue-primary/10 rounded-2xl shadow-sm hover:shadow-md hover:border-brand-blue-primary/20 transition-all overflow-hidden"
                style={{ padding: 'min(12px, 3cqmin)' }}
              >
                {/* Activity info */}
                <div
                  className="flex items-start justify-between"
                  style={{
                    gap: 'min(12px, 3cqmin)',
                    marginBottom: 'min(10px, 2.5cqmin)',
                  }}
                >
                  <div className="min-w-0">
                    <h3
                      className="font-bold text-brand-blue-dark truncate"
                      style={{ fontSize: 'min(14px, 4.5cqmin)' }}
                    >
                      {activity.title}
                    </h3>
                    <div
                      className="flex items-center flex-wrap mt-0.5"
                      style={{ gap: 'min(6px, 1.5cqmin)' }}
                    >
                      <span
                        className="bg-brand-red-lighter text-brand-red-primary font-bold rounded-md"
                        style={{
                          fontSize: 'min(10px, 3cqmin)',
                          padding: 'min(1px, 0.2cqmin) min(6px, 1.5cqmin)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {activity.questionCount} Qs
                      </span>
                      <span
                        className="text-brand-gray-primary font-medium truncate max-w-xs"
                        style={{ fontSize: 'min(10px, 3cqmin)' }}
                      >
                        {activity.youtubeUrl}
                      </span>
                    </div>
                  </div>
                  <span
                    className="text-brand-gray-primary font-medium shrink-0"
                    style={{ fontSize: 'min(10px, 3cqmin)' }}
                  >
                    {new Date(
                      activity.updatedAt || activity.createdAt
                    ).toLocaleDateString()}
                  </span>
                </div>

                {/* Actions */}
                {confirmDelete === activity.id ? (
                  <div
                    className="flex items-center justify-end bg-brand-red-lighter/30 rounded-xl"
                    style={{
                      gap: 'min(8px, 2cqmin)',
                      padding: 'min(8px, 2cqmin)',
                    }}
                  >
                    <span
                      className="text-brand-red-dark font-bold"
                      style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                    >
                      Delete?
                    </span>
                    <button
                      onClick={() => {
                        setConfirmDelete(null);
                        onDelete(activity);
                      }}
                      className="bg-brand-red-primary hover:bg-brand-red-dark text-white font-bold rounded-lg transition-colors shadow-sm"
                      style={{
                        padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                        fontSize: 'min(12px, 3.5cqmin)',
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition-colors"
                      style={{
                        padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                        fontSize: 'min(12px, 3.5cqmin)',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-end"
                    style={{ gap: 'min(6px, 1.5cqmin)' }}
                  >
                    <ActionButton
                      icon={<BarChart3 />}
                      label="Results"
                      onClick={() => onResults(activity)}
                      color="text-violet-600 hover:bg-violet-50"
                    />
                    <ActionButton
                      icon={<Edit2 />}
                      label="Edit"
                      onClick={() => onEdit(activity)}
                      color="text-brand-blue-primary hover:bg-brand-blue-lighter/50"
                    />
                    <ActionButton
                      icon={<Link2 />}
                      label="Assign"
                      onClick={() => setAssignTarget(activity)}
                      color="text-emerald-600 hover:bg-emerald-50"
                    />
                    <ActionButton
                      icon={<Trash2 />}
                      label="Delete"
                      onClick={() => setConfirmDelete(activity.id)}
                      color="text-brand-red-primary hover:bg-brand-red-lighter/40"
                    />
                  </div>
                )}
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
    className={`flex items-center font-bold rounded-lg transition-all active:scale-95 ${color}`}
    style={{
      gap: 'min(4px, 1cqmin)',
      padding: 'min(5px, 1.2cqmin) min(9px, 2.2cqmin)',
      fontSize: 'min(11px, 3cqmin)',
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
    {label}
  </button>
);
