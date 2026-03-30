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
} from 'lucide-react';
import { VideoActivityMetadata } from '@/types';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';

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
  const [searchQuery, setSearchQuery] = useState('');

  const filteredActivities = useMemo(() => {
    if (!searchQuery.trim()) return activities;
    const low = searchQuery.toLowerCase();
    return activities.filter((a) => a.title.toLowerCase().includes(low));
  }, [activities, searchQuery]);

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
              style={{ fontSize: 'min(15px, 4cqmin)' }}
            >
              Video Activities
            </span>
            <span
              className="text-brand-blue-primary/60 font-bold"
              style={{ fontSize: 'min(10px, 2.5cqmin)' }}
            >
              {activities.length} total • Interactive Lessons
            </span>
          </div>
        </div>
        <button
          onClick={onNew}
          className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-black rounded-xl transition-all active:scale-95 shadow-lg shadow-brand-blue-primary/20"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(8px, 2cqmin) min(14px, 3.5cqmin)',
            fontSize: 'min(12px, 3cqmin)',
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
                fontSize: 'min(13px, 3.5cqmin)',
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
                    fontSize: 'min(11px, 3.25cqmin)',
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
              style={{ fontSize: 'min(14px, 4cqmin)' }}
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
                      style={{ fontSize: 'min(14px, 4cqmin)' }}
                    >
                      {activity.title}
                    </h3>
                    <span
                      className="bg-brand-red-lighter text-brand-red-primary font-black uppercase tracking-widest rounded-md shrink-0"
                      style={{
                        fontSize: 'min(8px, 2cqmin)',
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
                      fontSize: 'min(11px, 3cqmin)',
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
                          fontSize: 'min(10px, 2.5cqmin)',
                        }}
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition-colors"
                        style={{
                          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                          fontSize: 'min(10px, 2.5cqmin)',
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
      gap: 'min(4px, 1cqmin)',
      padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
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
    <span className="hidden sm:inline">{label}</span>
  </button>
);
