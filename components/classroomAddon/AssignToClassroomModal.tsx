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
import { AlertTriangle, Check, GraduationCap, Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { functions, db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { ClassroomAttachmentLink } from '@/types';
import { logError } from '@/utils/logError';
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
  persistClassroomAttachmentLinks,
  type AssignRunnerKind,
  type AssignToClassroomResult,
} from '@/utils/assignToClassroom';
import {
  DEFAULT_DUE_TIME,
  dueInputsToEpoch,
  splitDueAtToInputs,
} from '@/utils/localDate';
import { findLinkedClassroomCourseId } from '@/utils/classroomCourseLinks';

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
  /** Whether `initialDueAt` carries a chosen time (vs a legacy date-only value). */
  initialDueAtHasTime?: boolean;
  /**
   * The ClassLink class(es) this assignment targets. When one of them is already
   * linked to a Google course (Item D), that course is auto-selected so the
   * teacher confirms instead of re-picking. Omitted → the plain picker.
   */
  classlinkClassIds?: string[];
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
  initialDueAtHasTime,
  classlinkClassIds,
  addToast,
  onAssigned,
}) => {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [courses, setCourses] = useState<GoogleClassroomCourse[]>([]);
  // One SpartBoard assignment can fan out to MULTIPLE Classroom courses (Item D),
  // each getting its own courseWork pointing back at this same session.
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  // True when a course was auto-resolved from an existing class↔course link
  // (Item D) rather than picked — drives the "already linked" hint.
  const [autoLinked, setAutoLinked] = useState(false);
  // Due date + time split into the picker-bound input strings. The host mounts
  // this fresh on each open, so the useState initializers seed from initialDueAt.
  const initialDue = splitDueAtToInputs(
    initialDueAt ?? null,
    initialDueAtHasTime
  );
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
        // Item D: if a targeted ClassLink class is already linked to one of these
        // courses, auto-select it so the teacher confirms instead of re-picking.
        // Best-effort — a lookup failure just leaves the plain picker.
        if (classlinkClassIds && classlinkClassIds.length > 0 && user?.uid) {
          try {
            const linkedId = await findLinkedClassroomCourseId(
              db,
              classlinkClassIds,
              user.uid
            );
            if (cancelled) return;
            if (linkedId && list.some((c) => c.id === linkedId)) {
              setSelectedCourseIds([linkedId]);
              setAutoLinked(true);
            }
          } catch {
            // Ignore — fall back to the manual picker.
          }
        }
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
    // This effect mints the OAuth token + lists courses ONCE per open; it reads
    // `classlinkClassIds`/`user.uid` at run time only (for the reverse lookup) —
    // adding them as deps would re-run and re-fire the consent popup, so they're
    // intentionally excluded (the modal mounts fresh per open, so values are
    // current).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userEmail, reloadNonce]);

  const handleAssign = useCallback(async () => {
    if (selectedCourseIds.length === 0) return;
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

      // The date+time picker always yields an explicit local time → emit it
      // verbatim to Classroom (vs an end-of-day default for date-only values).
      // dueHasTime only discriminates a PRESENT epoch, so it tracks dueAt's
      // presence (null when no due date was chosen).
      const dueAt = dueInputsToEpoch(dueDate, dueTime);
      const dueHasTime = dueAt != null;

      // Fan out: create ONE courseWork + add-on attachment per selected course,
      // reusing the single consented token. Each is a SEPARATE Classroom item
      // pointing at the SAME SpartBoard session, so a per-course failure is real
      // (that course got nothing) and must NOT abort the others — we collect the
      // successes and report the failures.
      const links: ClassroomAttachmentLink[] = [];
      const failedCourses: string[] = [];
      let firstResult: AssignToClassroomResult | null = null;
      for (const courseId of selectedCourseIds) {
        try {
          const result = await assignToClassroom(functions, {
            accessToken: token,
            courseId,
            origin: window.location.origin,
            kind,
            quizCode: kind === 'quiz' ? quizCode : undefined,
            sessionId,
            title,
            maxPoints,
            dueAt,
            dueHasTime,
          });
          firstResult ??= result;
          // Addon path only — the link/redirect path has no embedded passback.
          const link = buildClassroomAttachmentLink(result, courseId);
          if (link) links.push(link);
        } catch (err) {
          logError('AssignToClassroomModal.assign', err, {
            courseId,
            sessionId,
          });
          failedCourses.push(
            courses.find((c) => c.id === courseId)?.name ?? courseId
          );
        }
      }

      // Persist ALL successful linkages at once so the grade-push button appears
      // and the Publish=Push fan-out targets every course.
      if (links.length > 0) {
        try {
          await persistClassroomAttachmentLinks(
            db,
            kind,
            sessionId,
            uid,
            links
          );
        } catch {
          // The Classroom assignments exist; only the local linkage write
          // failed. Surface a soft warning rather than implying the assign
          // failed — re-assigning would duplicate the Classroom items.
          addToast(
            'Assigned to Classroom, but could not link grade sync. Re-open Results to retry.',
            'info'
          );
        }
      }

      // Every selected course failed → keep the picker up so the teacher retries.
      if (firstResult === null) {
        setErrorMsg('Failed to assign to Google Classroom.');
        setPhase('pick');
        return;
      }

      const assignedCount = selectedCourseIds.length - failedCourses.length;
      if (failedCourses.length > 0) {
        addToast(
          `Assigned to ${assignedCount} course${assignedCount === 1 ? '' : 's'}; ` +
            `${failedCourses.length} failed (${failedCourses.join(', ')}).`,
          'info'
        );
      } else {
        // Derive the wording from what we actually got back rather than the
        // first course's mode: `links` holds only the embedded (add-on)
        // attachments, so an empty `links` means every course fell back to a
        // plain link (this account can't embed), while a non-empty `links`
        // means at least one course got the embedded runner + grade passback.
        addToast(
          links.length > 0
            ? `Assigned to Google Classroom${assignedCount > 1 ? ` (${assignedCount} courses)` : ''} — students launch it in Classroom.`
            : 'Assigned to Google Classroom as a link (this account can’t embed the activity).',
          'success'
        );
      }
      onAssigned?.(firstResult);
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
    selectedCourseIds,
    user,
    kind,
    quizCode,
    sessionId,
    title,
    maxPoints,
    dueDate,
    dueTime,
    courses,
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
        disabled={selectedCourseIds.length === 0 || busy}
        className="inline-flex items-center gap-2 text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {phase === 'assigning' && (
          <Loader2 size={16} className="animate-spin" />
        )}
        {phase === 'assigning'
          ? 'Assigning…'
          : selectedCourseIds.length > 1
            ? `Assign to ${selectedCourseIds.length} courses`
            : 'Assign'}
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

            {autoLinked && (
              <div className="flex items-start gap-2 rounded-lg bg-brand-blue-lighter/30 border border-brand-blue-primary/20 px-3 py-2 text-sm text-brand-blue-dark">
                <GraduationCap size={16} className="mt-0.5 shrink-0" />
                <span>
                  Already linked to this class — we picked the course for you.
                  Review and assign, or change it below.
                </span>
              </div>
            )}

            <div>
              {/* Not a <label>: the course list is a checkbox group, not a
                  single labeled form control. Use a heading + an id'd hint wired
                  as the group's aria-describedby so the "pick one or more"
                  affordance is announced. */}
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                <span>Courses</span>
                <span
                  id="assign-classroom-course-hint"
                  className="font-normal normal-case text-slate-400"
                >
                  Pick one or more
                </span>
              </div>
              {courses.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  No active Google Classroom courses found.
                </p>
              ) : (
                <div
                  role="group"
                  aria-label="Google Classroom courses"
                  aria-describedby="assign-classroom-course-hint"
                  className="max-h-64 overflow-y-auto custom-scrollbar rounded-lg border border-slate-200 divide-y divide-slate-100"
                >
                  {courses.map((c) => {
                    const checked = selectedCourseIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => {
                          setSelectedCourseIds((prev) =>
                            prev.includes(c.id)
                              ? prev.filter((id) => id !== c.id)
                              : [...prev, c.id]
                          );
                          setAutoLinked(false);
                        }}
                        disabled={phase === 'assigning'}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${
                          checked
                            ? 'bg-brand-blue-primary/5'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`inline-flex items-center justify-center w-4 h-4 rounded border-2 shrink-0 ${
                            checked
                              ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                              : 'border-slate-300'
                          }`}
                        >
                          {checked && <Check size={12} strokeWidth={3} />}
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
