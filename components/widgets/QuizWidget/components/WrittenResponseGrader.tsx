/**
 * WrittenResponseGrader — teacher-facing modal for manually grading
 * `short` / `essay` quiz responses. Phase 1 surface: prev/next student
 * navigation, points input, optional overall comment.
 *
 * Annotations (Phase 2) and rubric scoring (Phase 3) are out of scope
 * here; the storage shape (`WrittenAnswerGrade.annotations`,
 * `rubricScores`) is already reserved on the type so this component can
 * grow into those features without a schema migration.
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
import { QuizData, QuizResponse, WrittenAnswerGrade } from '@/types';
import { sanitizeHtml } from '@/utils/security';

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
  const responseKey = response?._responseKey;

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
  const [hydrationKey, setHydrationKey] = useState<string>('');

  const targetKey = `${responseKey ?? ''}::${question?.id ?? ''}`;
  if (targetKey !== hydrationKey) {
    setHydrationKey(targetKey);
    setPointsInput(savedGrade != null ? String(savedGrade.pointsAwarded) : '');
    setComment(savedGrade?.overallComment ?? '');
    setSaveError(null);
  }

  const goPrevStudent = useCallback(() => {
    setStudentIdx((i) => Math.max(0, i - 1));
  }, []);
  const goNextStudent = useCallback(() => {
    setStudentIdx((i) =>
      Math.min(Math.max(0, gradeableResponses.length - 1), i + 1)
    );
  }, [gradeableResponses.length]);
  const goPrevQuestion = useCallback(() => {
    setQuestionIdx((i) => Math.max(0, i - 1));
  }, []);
  const goNextQuestion = useCallback(() => {
    setQuestionIdx((i) =>
      Math.min(Math.max(0, writtenQuestions.length - 1), i + 1)
    );
  }, [writtenQuestions.length]);

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
    const parsed = Number(pointsInput);
    if (!Number.isFinite(parsed)) {
      setSaveError('Enter a numeric score.');
      return;
    }
    if (parsed < 0 || parsed > maxPoints) {
      setSaveError(`Score must be between 0 and ${maxPoints}.`);
      return;
    }
    const grade: WrittenAnswerGrade = {
      pointsAwarded: parsed,
      overallComment: comment.trim() || undefined,
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
            <article
              className="bg-white border border-slate-200 rounded-lg p-5 text-sm leading-relaxed text-slate-800 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(studentAnswer),
              }}
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
            ) : (
              <>
                Save &amp; next <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-xs text-slate-500 leading-relaxed">
            ← / → switch students. Esc closes the grader. Phase 2 will add
            inline highlights and margin comments; Phase 3 adds rubric scoring.
          </p>
        </aside>
      </div>
    </ModalShell>
  );
};

const ModalShell: React.FC<{
  onClose: () => void;
  children: React.ReactNode;
}> = ({ onClose, children }) => (
  <div className="fixed inset-0 z-overlay flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
    <button
      type="button"
      aria-label="Close grader backdrop"
      className="absolute inset-0 cursor-default"
      onClick={onClose}
    />
    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
      {children}
    </div>
  </div>
);

export default WrittenResponseGrader;
