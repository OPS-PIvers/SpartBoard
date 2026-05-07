/**
 * PublishScoresModal — teacher-facing modal that controls what each
 * student sees on the `/my-assignments` Completed review screen for a
 * given assignment.
 *
 * Reached from the archive tab's per-assignment kebab → "Publish Scores".
 * The four levels map to `QuizScoreVisibility`:
 *
 *   - none: scores are hidden from students (default / unpublish path).
 *   - score-only: students see their final percentage score.
 *   - score-and-responses: above + each of their answers tagged
 *     correct / incorrect.
 *   - score-responses-and-answers: above + the canonical correct answer
 *     for every question.
 *
 * The modal is purely a level-picker — the actual publish work
 * (computing scores, writing per-response `isCorrect`, populating
 * `session.revealedAnswers`, mirroring the visibility flag) is done by
 * `useQuizAssignments.publishAssignmentScores`.
 */

import React, { useState } from 'react';
import {
  CheckCircle2,
  EyeOff,
  Gauge,
  ListChecks,
  Loader2,
  Trophy,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { QuizScoreVisibility } from '@/types';

interface PublishScoresModalProps {
  /** Quiz title — shown as a sub-line so the teacher knows which assignment they're publishing. */
  quizTitle: string;
  /** Currently-published level (or 'none' / undefined when nothing is published yet). */
  currentVisibility: QuizScoreVisibility | undefined;
  onClose: () => void;
  onConfirm: (visibility: QuizScoreVisibility) => Promise<void> | void;
}

interface VisibilityOption {
  id: QuizScoreVisibility;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const OPTIONS: VisibilityOption[] = [
  {
    id: 'score-only',
    title: 'Score only',
    body: 'Students see just their final score.',
    Icon: Trophy,
  },
  {
    id: 'score-and-responses',
    title: 'Score & Responses',
    body: 'Students see their score and which of their answers were correct or incorrect.',
    Icon: ListChecks,
  },
  {
    id: 'score-responses-and-answers',
    title: 'Score, Responses, & Answers',
    body: 'Students see their score, their answers marked correct or incorrect, and the correct answer for each question.',
    Icon: CheckCircle2,
  },
];

export const PublishScoresModal: React.FC<PublishScoresModalProps> = ({
  quizTitle,
  currentVisibility,
  onClose,
  onConfirm,
}) => {
  // Default the picker to whatever the assignment is currently set to (or
  // 'score-only' on first publish — the calmest non-empty choice).
  const initial: QuizScoreVisibility =
    currentVisibility && currentVisibility !== 'none'
      ? currentVisibility
      : 'score-only';
  const [selected, setSelected] = useState<QuizScoreVisibility>(initial);
  const [submitting, setSubmitting] = useState(false);

  const isPublished =
    currentVisibility !== undefined && currentVisibility !== 'none';

  const handleConfirm = async (visibility: QuizScoreVisibility) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(visibility);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={submitting ? () => undefined : onClose}
      ariaLabel="Publish scores to students"
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Publish scores
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                {quizTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <div className="px-5 pb-5 pt-4 space-y-3">
        <p className="text-xs text-slate-600">
          Choose what students will see on their Completed list:
        </p>
        <div
          role="radiogroup"
          aria-label="Score visibility"
          className="space-y-2"
        >
          {OPTIONS.map((opt) => {
            const isActive = selected === opt.id;
            const Icon = opt.Icon;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setSelected(opt.id)}
                disabled={submitting}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-all focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 disabled:opacity-50 ${
                  isActive
                    ? 'border-brand-blue-primary bg-brand-blue-lighter/30 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                      isActive
                        ? 'bg-brand-blue-primary text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm">
                      {opt.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {opt.body}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="pt-2 flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">
          {isPublished ? (
            <button
              type="button"
              onClick={() => void handleConfirm('none')}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <EyeOff className="w-4 h-4" />
              Unpublish
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm(selected)}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-blue-dark transition-colors disabled:opacity-60"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isPublished ? 'Update' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
