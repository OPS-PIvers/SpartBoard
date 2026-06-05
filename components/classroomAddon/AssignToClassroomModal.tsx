/**
 * AssignToClassroomModal — the dashboard entry point for the teacher-initiated
 * ("partner-first") "Assign to Google Classroom" flow. Mirrors the SidebarClasses
 * course-picker UX: on open it mints a combined-scope token (one consent popup),
 * lists the teacher's ACTIVE courses, and on confirm calls `assignToClassroomV1`
 * to create the courseWork + add-on attachment in Classroom, then persists the
 * resulting `classroomAttachment` so the existing grade-push button lights up.
 *
 * Rendered ONLY behind the CLASSROOM_ASSIGN_ENABLED flag (see config/constants).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, GraduationCap, Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { functions, db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import {
  requestClassroomAssignToken,
  CLASSROOM_COURSES_READONLY_SCOPE,
  ensureGis,
  requestAccessToken,
} from '@/components/classroomAddon/gisOAuth';
import {
  listTeacherCourses,
  type GoogleClassroomCourse,
} from '@/utils/classroomCourses';
import {
  assignToClassroom,
  buildClassroomAttachmentLink,
  persistClassroomAttachmentLink,
  type AssignRunnerKind,
  type AssignToClassroomResult,
} from '@/utils/assignToClassroom';
import {
  DEFAULT_DUE_TIME,
  dueInputsToEpoch,
  splitDueAtToInputs,
} from '@/utils/localDate';

interface AssignToClassroomModalProps {
  isOpen: boolean;
  onClose: () => void;
  kind: AssignRunnerKind;
  /** SpartBoard session id (== assignmentId). */
  sessionId: string;
  /** Quiz join code — required when kind === 'quiz'. */
  quizCode?: string;
  /** Assignment / quiz title shown on the Classroom card. */
  title: string;
  /** Grade scale for the Classroom assignment (defaults server-side to 100). */
  maxPoints?: number;
  /** Pre-fill the due date (epoch ms) if the assignment already has one. */
  initialDueAt?: number | null;
  /** Toast surface from the host widget. */
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  /** Called after a successful assign (for the host to refresh UI). */
  onAssigned?: (result: AssignToClassroomResult) => void;
}

type Phase = 'loading' | 'pick' | 'error' | 'assigning';

export const AssignToClassroomModal: React.FC<AssignToClassroomModalProps> = ({
  isOpen,
  onClose,
  kind,
  sessionId,
  quizCode,
  title,
  maxPoints,
  initialDueAt,
  addToast,
  onAssigned,
}) => {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [courses, setCourses] = useState<GoogleClassroomCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  // Due date + time split into the picker-bound input strings. The host mounts
  // this fresh on each open, so the useState initializers seed from initialDueAt.
  const initialDue = splitDueAtToInputs(initialDueAt ?? null);
  const [dueDate, setDueDate] = useState(initialDue.date);
  const [dueTime, setDueTime] = useState(initialDue.time);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Bumped by the retry button to re-run the open effect's load.
  const [reloadNonce, setReloadNonce] = useState(0);
  // Token reused at confirm time so a successful list → assign needs one popup.
  const accessTokenRef = useRef<string | null>(null);
  const userEmail = user?.email ?? undefined;

  // Kick off the OAuth popup + course load when the modal opens (external system
  // sync: GIS popup + Classroom fetch). The work runs in an inline async callback
  // so every setState lands AFTER an await (never synchronously in the effect
  // body — the documented "setState from a callback" escape). Re-runs when the
  // retry button bumps `reloadNonce`. The host mounts this fresh on each open
  // (it's conditionally rendered), so the due date/time useState initializers
  // already seed from `initialDueAt`.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await requestClassroomAssignToken(userEmail);
        if (cancelled) return;
        accessTokenRef.current = token;
        const list = await listTeacherCourses(token);
        if (cancelled) return;
        setCourses(list);
        setErrorMsg(null);
        setPhase('pick');
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(
          err instanceof Error ? err.message : 'Failed to load your courses.'
        );
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, userEmail, reloadNonce]);

  const handleAssign = useCallback(async () => {
    if (!selectedCourseId) return;
    const uid = user?.uid;
    if (!uid) {
      addToast('You must be signed in to assign.', 'error');
      return;
    }
    setPhase('assigning');
    setErrorMsg(null);
    try {
      // Re-acquire the token if it was cleared (silent if already consented).
      let token = accessTokenRef.current;
      if (!token) {
        await ensureGis();
        token = await requestAccessToken(
          CLASSROOM_COURSES_READONLY_SCOPE,
          user?.email ?? undefined
        );
        accessTokenRef.current = token;
      }
      const result = await assignToClassroom(functions, {
        accessToken: token,
        courseId: selectedCourseId,
        origin: window.location.origin,
        kind,
        quizCode: kind === 'quiz' ? quizCode : undefined,
        sessionId,
        title,
        maxPoints,
        dueAt: dueInputsToEpoch(dueDate, dueTime),
      });

      // Persist the linkage so the existing grade-push button appears (addon
      // path only — the link/redirect path has no embedded grade passback).
      const link = buildClassroomAttachmentLink(result, selectedCourseId);
      if (link) {
        try {
          await persistClassroomAttachmentLink(db, kind, sessionId, uid, link);
        } catch {
          // The Classroom assignment exists; only the local linkage write
          // failed. Surface a soft warning rather than implying the assign
          // failed — re-assigning would duplicate the Classroom item.
          addToast(
            'Assigned to Classroom, but could not link grade sync. Re-open Results to retry.',
            'info'
          );
        }
      }

      addToast(
        result.mode === 'addon'
          ? 'Assigned to Google Classroom — students launch it in Classroom.'
          : 'Assigned to Google Classroom as a link (this account can’t embed the activity).',
        'success'
      );
      onAssigned?.(result);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Failed to assign to Google Classroom.'
      );
      setPhase('pick');
    }
  }, [
    selectedCourseId,
    user,
    kind,
    quizCode,
    sessionId,
    title,
    maxPoints,
    dueDate,
    dueTime,
    addToast,
    onAssigned,
    onClose,
  ]);

  const customHeader = (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 shrink-0">
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-brand-blue-primary/10 text-brand-blue-primary">
        <GraduationCap size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest">
          Assign to Google Classroom
        </p>
        <h3 className="font-black text-base text-slate-800 truncate">
          {title}
        </h3>
      </div>
    </div>
  );

  const busy = phase === 'loading' || phase === 'assigning';
  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={phase === 'assigning'}
        className="text-sm font-bold text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void handleAssign()}
        disabled={!selectedCourseId || busy}
        className="inline-flex items-center gap-2 text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {phase === 'assigning' && (
          <Loader2 size={16} className="animate-spin" />
        )}
        {phase === 'assigning' ? 'Assigning…' : 'Assign'}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      customHeader={customHeader}
      footer={footer}
      maxWidth="max-w-lg"
      ariaLabel="Assign to Google Classroom"
    >
      <div className="py-4 space-y-4">
        {phase === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm font-semibold">
              Loading your Google Classroom courses…
            </span>
          </div>
        )}

        {phase === 'error' && (
          <div className="py-6 text-center space-y-3">
            <AlertTriangle size={28} className="mx-auto text-amber-500" />
            <p className="text-sm text-slate-600">{errorMsg}</p>
            <button
              type="button"
              onClick={() => {
                setPhase('loading');
                setErrorMsg(null);
                setReloadNonce((n) => n + 1);
              }}
              className="text-sm font-bold text-brand-blue-primary hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {(phase === 'pick' || phase === 'assigning') && (
          <>
            {errorMsg && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                Course
              </label>
              {courses.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  No active Google Classroom courses found.
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto custom-scrollbar rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {courses.map((c) => {
                    const checked = selectedCourseId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCourseId(c.id)}
                        disabled={phase === 'assigning'}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${
                          checked
                            ? 'bg-brand-blue-primary/5'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`inline-flex items-center justify-center w-4 h-4 rounded-full border-2 shrink-0 ${
                            checked
                              ? 'border-brand-blue-primary'
                              : 'border-slate-300'
                          }`}
                        >
                          {checked && (
                            <span className="w-2 h-2 rounded-full bg-brand-blue-primary" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-800 truncate">
                            {c.name}
                          </span>
                          {c.section && (
                            <span className="block text-xs text-slate-500 truncate">
                              {c.section}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="assign-classroom-due-date"
                className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2"
              >
                Due date{' '}
                <span className="font-normal normal-case">(optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="assign-classroom-due-date"
                  type="date"
                  value={dueDate}
                  disabled={phase === 'assigning'}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                />
                <input
                  type="time"
                  aria-label="Due time"
                  value={dueTime}
                  disabled={phase === 'assigning' || !dueDate}
                  onChange={(e) =>
                    setDueTime(e.target.value || DEFAULT_DUE_TIME)
                  }
                  className="w-32 px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Synced to the Google Classroom assignment’s due date and time
                (your local time).
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
