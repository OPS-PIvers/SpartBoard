/**
 * WrittenResponseGrader — teacher-facing modal for manually grading
 * `short` / `essay` quiz responses.
 *
 * Phase 1 shipped points entry, an optional overall comment, and
 * prev/next student navigation. Phase 2 adds inline highlights + margin
 * comments via `AnnotatedResponseView`. Annotations are stored as
 * plaintext offsets into a frozen `gradingSnapshot` of the student's
 * answer, so highlights stay anchored even if the teacher later unlocks
 * the attempt and the student edits.
 *
 * Rubric scoring (Phase 3) is still out of scope; the storage shape
 * (`WrittenAnswerGrade.rubricScores`) is already reserved on the type so
 * this component can grow into it without a schema migration.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  QuizData,
  QuizResponse,
  WrittenAnswerAnnotation,
  WrittenAnswerGrade,
} from '@/types';
import { sanitizeQuizResponse } from '@/utils/security';
import { AnnotatedResponseView } from './AnnotatedResponseView';

interface WrittenResponseGraderProps {
  quiz: QuizData;
  responses: QuizResponse[];
  /** Map from a response's deterministic doc key to a display name. */
  displayNameByResponseKey?: Map<string, string>;
  /**
   * Persist a grade to Firestore. Receives the response's doc key (NOT
   * `studentUid` — keys are pin-derived for anonymous joiners), the
   * question id, and the full grade object. Caller is responsible for
   * the Firestore write — keeps the modal pure / testable.
   */
  onSaveGrade: (
    responseKey: string,
    questionId: string,
    grade: WrittenAnswerGrade
  ) => Promise<void>;
  /** Current teacher uid, stamped as `gradedBy` on each grade. */
  teacherUid: string;
  onClose: () => void;
}

export const WrittenResponseGrader: React.FC<WrittenResponseGraderProps> = ({
  quiz,
  responses,
  displayNameByResponseKey,
  onSaveGrade,
  teacherUid,
  onClose,
}) => {
  // Surface only the questions that actually need manual grading.
  const writtenQuestions = useMemo(
    () =>
      quiz.questions.filter((q) => q.type === 'short' || q.type === 'essay'),
    [quiz.questions]
  );

  // Drop responses that have no written answer at all — there's nothing
  // to grade. Keep responses that have at least one written answer or
  // already-graded entries (so a teacher can revise prior grades).
  const gradeableResponses = useMemo(() => {
    const ids = new Set(writtenQuestions.map((q) => q.id));
    return responses.filter(
      (r) =>
        r.answers.some((a) => ids.has(a.questionId)) ||
        (r.grading && Object.keys(r.grading).some((qid) => ids.has(qid)))
    );
  }, [responses, writtenQuestions]);

  const [studentIdx, setStudentIdx] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Clamp indices if the response/question list shrinks mid-session.
  if (
    studentIdx >= gradeableResponses.length &&
    gradeableResponses.length > 0
  ) {
    setStudentIdx(0);
  }
  if (questionIdx >= writtenQuestions.length && writtenQuestions.length > 0) {
    setQuestionIdx(0);
  }

  const response = gradeableResponses[studentIdx];
  const question = writtenQuestions[questionIdx];
  // Match the keying scheme used by the parent's `displayNameByResponseKey`
  // map and the `saveWrittenGrade` callback (`_responseKey ?? studentUid`).
  // Without the fallback, any response written before deterministic keying
  // shipped (where `_responseKey` is missing but `studentUid` is set) would
  // silently fail to save here while the parent's lookup would have
  // succeeded.
  const responseKey = response?._responseKey ?? response?.studentUid;

  const studentLabel = useMemo(() => {
    if (!response) return '';
    const fromMap = responseKey
      ? displayNameByResponseKey?.get(responseKey)
      : undefined;
    if (fromMap) return fromMap;
    if (response.pin) return `PIN ${response.pin}`;
    return response.studentUid?.slice(0, 8) ?? 'Student';
  }, [response, displayNameByResponseKey, responseKey]);

  // Local draft state for the form, hydrated from the saved grade on
  // every student/question change so unsaved edits don't bleed across
  // students.
  const savedGrade = response?.grading?.[question?.id ?? ''];
  const maxPoints = question?.points ?? 1;
  const [pointsInput, setPointsInput] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [draftAnnotations, setDraftAnnotations] = useState<
    WrittenAnswerAnnotation[]
  >([]);
  const [hydrationKey, setHydrationKey] = useState<string>('');

  const targetKey = `${responseKey ?? ''}::${question?.id ?? ''}`;
  if (targetKey !== hydrationKey) {
    setHydrationKey(targetKey);
    setPointsInput(savedGrade != null ? String(savedGrade.pointsAwarded) : '');
    setComment(savedGrade?.overallComment ?? '');
    setDraftAnnotations(savedGrade?.annotations ?? []);
    setSaveError(null);
  }

  // Are there unsaved edits in the form? `savedGrade` is the persisted
  // value; comparing string projections handles the "empty input vs.
  // never-saved" case correctly. Used to warn the teacher before they
  // navigate away from a row they were typing into.
  const savedPointsStr =
    savedGrade != null ? String(savedGrade.pointsAwarded) : '';
  const savedCommentStr = savedGrade?.overallComment ?? '';
  // Stable equality on the annotation list. `JSON.stringify` would
  // false-positive when Firestore-loaded annotations and locally-built
  // ones disagree on key insertion order, even when the fields match.
  // Compare the canonical fields explicitly instead.
  const annotationsEqual = annotationListsEqual(
    draftAnnotations,
    savedGrade?.annotations
  );
  const isDirty =
    pointsInput !== savedPointsStr ||
    comment !== savedCommentStr ||
    !annotationsEqual;

  const confirmDiscardIfDirty = useCallback((): boolean => {
    if (!isDirty) return true;
    // Browser confirm is intentionally minimal — Phase 1 doesn't ship a
    // custom modal-on-modal flow. Teachers rarely navigate away
    // mid-edit; the warning is a safety net for accidental clicks.
    return window.confirm(
      'You have unsaved grade edits. Discard them and navigate anyway?'
    );
  }, [isDirty]);

  const goPrevStudent = useCallback(() => {
    if (!confirmDiscardIfDirty()) return;
    setStudentIdx((i) => Math.max(0, i - 1));
  }, [confirmDiscardIfDirty]);
  const goNextStudent = useCallback(() => {
    if (!confirmDiscardIfDirty()) return;
    setStudentIdx((i) =>
      Math.min(Math.max(0, gradeableResponses.length - 1), i + 1)
    );
  }, [gradeableResponses.length, confirmDiscardIfDirty]);
  const goPrevQuestion = useCallback(() => {
    if (!confirmDiscardIfDirty()) return;
    setQuestionIdx((i) => Math.max(0, i - 1));
  }, [confirmDiscardIfDirty]);
  const goNextQuestion = useCallback(() => {
    if (!confirmDiscardIfDirty()) return;
    setQuestionIdx((i) =>
      Math.min(Math.max(0, writtenQuestions.length - 1), i + 1)
    );
  }, [writtenQuestions.length, confirmDiscardIfDirty]);

  // Keyboard navigation. Only active when no input has focus — we don't
  // want left/right inside the points input to jump students.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      const inField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (inField) return;
      if (e.key === 'ArrowLeft' || e.key === 'k') {
        e.preventDefault();
        goPrevStudent();
      } else if (e.key === 'ArrowRight' || e.key === 'j') {
        e.preventDefault();
        goNextStudent();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrevStudent, goNextStudent, onClose]);

  const handleSave = useCallback(async () => {
    if (!response || !question || !responseKey) return;
    const trimmed = pointsInput.trim();
    if (trimmed === '') {
      setSaveError('Enter a numeric score.');
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setSaveError('Enter a numeric score.');
      return;
    }
    if (parsed < 0 || parsed > maxPoints) {
      setSaveError(`Score must be between 0 and ${maxPoints}.`);
      return;
    }
    // Snapshot the student's answer the first time we save annotations,
    // and keep that snapshot frozen forever after. This is what makes
    // annotation offsets stable: even if the teacher later unlocks the
    // attempt and the student edits, the snapshot the offsets index
    // into is unchanged.
    const hasAnnotations = draftAnnotations.length > 0;
    const existingSnapshot = savedGrade?.gradingSnapshot;
    const studentAnswerForSnapshot =
      response.answers.find((a) => a.questionId === question.id)?.answer ?? '';
    const gradingSnapshot = hasAnnotations
      ? (existingSnapshot ?? sanitizeQuizResponse(studentAnswerForSnapshot))
      : existingSnapshot;
    const grade: WrittenAnswerGrade = {
      pointsAwarded: parsed,
      overallComment: comment.trim() || undefined,
      annotations: hasAnnotations ? draftAnnotations : undefined,
      gradingSnapshot,
      gradedBy: teacherUid,
      gradedAt: Date.now(),
    };
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveGrade(responseKey, question.id, grade);
      // After a successful save, advance to the next student to keep the
      // teacher in flow. If we're on the last student, stay put.
      if (studentIdx < gradeableResponses.length - 1) {
        setStudentIdx(studentIdx + 1);
      }
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save grade.'
      );
    } finally {
      setSaving(false);
    }
  }, [
    response,
    question,
    responseKey,
    pointsInput,
    maxPoints,
    comment,
    draftAnnotations,
    savedGrade,
    teacherUid,
    onSaveGrade,
    studentIdx,
    gradeableResponses.length,
  ]);

  if (writtenQuestions.length === 0) {
    return (
      <ModalShell onClose={onClose}>
        <div className="p-10 text-center text-slate-600">
          <p className="text-lg font-bold">
            No written questions in this quiz.
          </p>
          <p className="text-sm text-slate-500 mt-2">
            Manual grading is only available for short-answer and essay
            questions.
          </p>
        </div>
      </ModalShell>
    );
  }

  if (gradeableResponses.length === 0 || !response || !question) {
    return (
      <ModalShell onClose={onClose}>
        <div className="p-10 text-center text-slate-600">
          <p className="text-lg font-bold">
            No written responses to grade yet.
          </p>
          <p className="text-sm text-slate-500 mt-2">
            Students haven&apos;t submitted any short-answer or essay responses.
          </p>
        </div>
      </ModalShell>
    );
  }

  const studentAnswer =
    response.answers.find((a) => a.questionId === question.id)?.answer ?? '';
  const tabSwitches = response.tabSwitchWarnings ?? 0;
  const fullyGradedForThisQ = !!savedGrade;
  const isLastStudent = studentIdx >= gradeableResponses.length - 1;

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={goPrevStudent}
            disabled={studentIdx === 0}
            className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous student (←)"
            title="Previous student (←)"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              Student {studentIdx + 1} of {gradeableResponses.length}
            </div>
            <div className="text-sm font-bold text-slate-900 truncate">
              {studentLabel}
              {fullyGradedForThisQ && (
                <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xxs uppercase tracking-wider">
                  <CheckCircle2 className="w-3 h-3" />
                  Graded
                </span>
              )}
              {tabSwitches > 0 && (
                <span
                  className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xxs uppercase tracking-wider"
                  title={`${tabSwitches} tab switch warning${tabSwitches === 1 ? '' : 's'} during the assessment`}
                >
                  <ShieldAlert className="w-3 h-3" />
                  {tabSwitches} tab switch{tabSwitches === 1 ? '' : 'es'}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={goNextStudent}
            disabled={studentIdx >= gradeableResponses.length - 1}
            className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next student (→)"
            title="Next student (→)"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded text-slate-500 hover:bg-slate-100 transition-colors"
          aria-label="Close grader"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Question switcher (only if there's more than one written Q) */}
      {writtenQuestions.length > 1 && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-slate-200 bg-slate-50">
          <button
            onClick={goPrevQuestion}
            disabled={questionIdx === 0}
            className="p-1 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous question"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-xs text-slate-600">
            Question {questionIdx + 1} of {writtenQuestions.length}
            <span className="ml-2 text-slate-400">·</span>
            <span className="ml-2 capitalize">{question.type}</span>
          </div>
          <button
            onClick={goNextQuestion}
            disabled={questionIdx >= writtenQuestions.length - 1}
            className="p-1 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next question"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 grid grid-cols-[1fr_320px] min-h-0">
        <section className="overflow-y-auto p-6 bg-slate-50">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">
            Question
          </h3>
          <p className="text-base font-bold text-slate-900 mb-6 leading-snug">
            {question.text}
          </p>

          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">
            Student response
          </h3>
          {studentAnswer ? (
            <AnnotatedResponseView
              mode="edit"
              // Once we've saved annotations, the snapshot is the
              // source of truth; until then, default to the live
              // sanitized answer so a teacher can start selecting text
              // even on a never-graded response.
              snapshot={
                savedGrade?.gradingSnapshot ??
                sanitizeQuizResponse(studentAnswer)
              }
              annotations={draftAnnotations}
              authorUid={teacherUid}
              onChange={setDraftAnnotations}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-5 text-sm text-slate-500 italic">
              The student didn&apos;t answer this question.
            </div>
          )}
        </section>

        <aside className="border-l border-slate-200 bg-white p-5 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label
              htmlFor="grade-points"
              className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1"
            >
              Points awarded
            </label>
            <div className="flex items-baseline gap-2">
              <input
                id="grade-points"
                type="number"
                inputMode="decimal"
                step="0.5"
                min={0}
                max={maxPoints}
                value={pointsInput}
                onChange={(e) => setPointsInput(e.target.value)}
                className="w-24 px-3 py-2 bg-white border-2 border-emerald-500/30 rounded-lg text-emerald-800 font-bold focus:outline-none focus:border-emerald-500 text-base"
                placeholder="0"
                autoFocus
              />
              <span className="text-sm text-slate-500 font-mono">
                / {maxPoints}
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="grade-comment"
              className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1"
            >
              Overall comment (optional)
            </label>
            <textarea
              id="grade-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={6}
              placeholder="Feedback for this student…"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary text-sm resize-none"
            />
          </div>

          {saveError && (
            <div className="p-2.5 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-lg text-xs text-brand-red-dark font-bold">
              {saveError}
            </div>
          )}

          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full py-2.5 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isLastStudent ? (
              'Save grade'
            ) : (
              <>
                Save &amp; next <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-xs text-slate-500 leading-relaxed">
            ← / → switch students. Esc closes the grader. Select text in the
            response to add a highlight or margin comment. Rubric scoring is
            coming in Phase 3.
          </p>
        </aside>
      </div>
    </ModalShell>
  );
};

/**
 * Field-level equality on two annotation lists. Insensitive to key
 * insertion order (so a Firestore-loaded annotation and a locally-built
 * one with the same fields compare equal), and treats `undefined` and
 * `missing` color/comment the same — avoids false-positive dirty
 * states from `JSON.stringify` ordering quirks.
 */
const annotationListsEqual = (
  a: WrittenAnswerAnnotation[],
  b: WrittenAnswerAnnotation[] | undefined
): boolean => {
  const right = b ?? [];
  if (a.length !== right.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = right[i];
    if (x.id !== y.id) return false;
    if (x.from !== y.from || x.to !== y.to) return false;
    if ((x.highlightColor ?? 'yellow') !== (y.highlightColor ?? 'yellow'))
      return false;
    if ((x.comment ?? '') !== (y.comment ?? '')) return false;
    if (x.authorUid !== y.authorUid) return false;
  }
  return true;
};

const ModalShell: React.FC<{
  onClose: () => void;
  children: React.ReactNode;
}> = ({ onClose, children }) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Grade written responses"
    className="fixed inset-0 z-overlay flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
  >
    {/*
      Backdrop is a non-focusable div so Tab can't escape into it and so a
      stray Space/Enter while focus is elsewhere doesn't close the modal.
      Click-to-dismiss is preserved via onClick. Esc-to-close is wired in
      the modal body's keydown listener.
    */}
    <div
      aria-hidden
      className="absolute inset-0 cursor-default"
      onClick={onClose}
    />
    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
      {children}
    </div>
  </div>
);

export default WrittenResponseGrader;
