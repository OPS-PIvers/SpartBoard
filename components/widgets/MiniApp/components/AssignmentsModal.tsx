/**
 * AssignmentsModal — teacher's view of all assignment sessions for a MiniApp.
 * Allows renaming, ending, and copying links to active sessions.
 * Modeled after VideoActivityWidget/components/Manager.tsx ResultsModal.
 */

import React, { useState } from 'react';
import {
  X,
  BarChart3,
  Link2,
  Clock3,
  Loader2,
  Pencil,
  Ban,
  Check,
  Copy,
  Inbox,
} from 'lucide-react';
import { MiniAppSession } from '@/types';
import { SubmissionsModal } from './SubmissionsModal';

interface AssignmentsModalProps {
  appTitle: string;
  sessions: MiniAppSession[];
  loading: boolean;
  onClose: () => void;
  onRenameSession: (sessionId: string, assignmentName: string) => Promise<void>;
  onEndSession: (sessionId: string) => Promise<void>;
}

export const AssignmentsModal: React.FC<AssignmentsModalProps> = ({
  appTitle,
  sessions,
  loading,
  onClose,
  onRenameSession,
  onEndSession,
}) => {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null);
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewingSubmissionsFor, setViewingSubmissionsFor] =
    useState<MiniAppSession | null>(null);

  const getLink = (sessionId: string) =>
    `${window.location.origin}/miniapp/${sessionId}`;

  const handleCopy = async (sessionId: string) => {
    await navigator.clipboard.writeText(getLink(sessionId));
    setCopiedId(sessionId);
    setTimeout(() => setCopiedId(null), 2000);
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
        {/* Header */}
        <div className="bg-indigo-600 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white min-w-0">
            <BarChart3 className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-black uppercase tracking-tight">Assignments</p>
              <p className="text-white/80 text-xs truncate">{appTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close assignments"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
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
                Click &ldquo;Assign&rdquo; on any app to create a shareable
                student link.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const isEditing = editingSessionId === session.id;
                const isSaving = savingSessionId === session.id;
                const link = getLink(session.id);

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
                        onClick={() => void handleCopy(session.id)}
                        className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-100 inline-flex items-center gap-1"
                      >
                        {copiedId === session.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy Link
                          </>
                        )}
                      </button>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-100 inline-flex items-center gap-1"
                      >
                        <Link2 className="w-3 h-3" />
                        Open
                      </a>
                      <button
                        onClick={() => setViewingSubmissionsFor(session)}
                        className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-100 inline-flex items-center gap-1"
                        title="View student submissions"
                      >
                        <Inbox className="w-3 h-3" />
                        Submissions
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

      {viewingSubmissionsFor && (
        <SubmissionsModal
          sessionId={viewingSubmissionsFor.id}
          assignmentName={viewingSubmissionsFor.assignmentName}
          classId={viewingSubmissionsFor.classId}
          onClose={() => setViewingSubmissionsFor(null)}
        />
      )}
    </div>
  );
};
