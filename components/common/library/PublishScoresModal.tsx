/**
 * PublishScoresModal — teacher-facing modal that controls what each
 * student sees on the `/my-assignments` Completed review screen for a
 * given assignment.
 *
 * Reached from the archive tab's per-assignment kebab → "Publish Scores".
 * The four levels map to the assignment's score-visibility union (Quiz
 * and Video Activity define structurally identical unions):
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
 * the caller's `publishAssignmentScores` hook.
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
import {
  RESULTS_PROTECTION_DEFAULTS,
  RESULTS_TAB_WARNING_THRESHOLD_MAX,
  RESULTS_TAB_WARNING_THRESHOLD_MIN,
  type GuidedLearningScoreVisibility,
  type QuizScoreVisibility,
  type ResultsProtection,
  type VideoActivityScoreVisibility,
} from '@/types';

/**
 * Score-visibility level. Quiz, VA, and GL all define the same
 * string-literal union; any of them resolves to the same shape at the
 * call site.
 */
export type PublishScoresVisibility =
  | QuizScoreVisibility
  | VideoActivityScoreVisibility
  | GuidedLearningScoreVisibility;

interface PublishScoresModalProps {
  /** Assignment title — sub-line so the teacher knows which assignment they're publishing. */
  assignmentTitle: string;
  /** Currently-published level (or 'none' / undefined when nothing is published yet). */
  currentVisibility: PublishScoresVisibility | undefined;
  onClose: () => void;
  onConfirm: (
    visibility: PublishScoresVisibility,
    protection?: ResultsProtection
  ) => Promise<void> | void;
  /**
   * Quiz-only opt-in: when true, render the anti-screenshot protection
   * fieldset (watermark + tab-switch warning) below the visibility picker.
   * VA and GL pass nothing and the fieldset stays hidden.
   */
  showProtection?: boolean;
  /**
   * Initial protection state. Caller (Quiz Widget) pre-fills this from
   * `appSettings.lastResultsProtection ?? RESULTS_PROTECTION_DEFAULTS` so
   * the teacher's last choice is remembered across publishes.
   */
  initialProtection?: ResultsProtection;
}

interface VisibilityOption {
  id: PublishScoresVisibility;
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
  assignmentTitle,
  currentVisibility,
  onClose,
  onConfirm,
  showProtection = false,
  initialProtection,
}) => {
  // Default the picker to whatever the assignment is currently set to (or
  // 'score-only' on first publish — the calmest non-empty choice).
  const initial: PublishScoresVisibility =
    currentVisibility && currentVisibility !== 'none'
      ? currentVisibility
      : 'score-only';
  const [selected, setSelected] = useState<PublishScoresVisibility>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [protection, setProtection] = useState<ResultsProtection>(
    () => initialProtection ?? RESULTS_PROTECTION_DEFAULTS
  );
  // Raw input value for the threshold field so the input can be transiently
  // empty (or otherwise invalid) while the user is editing without snapping
  // the persisted `protection.tabWarningThreshold` back to defaults.
  // Clamp + commit happens on blur and at submit time.
  const [thresholdInputValue, setThresholdInputValue] = useState<string>(() =>
    String(
      (initialProtection ?? RESULTS_PROTECTION_DEFAULTS).tabWarningThreshold
    )
  );

  const isPublished =
    currentVisibility !== undefined && currentVisibility !== 'none';

  const clampThreshold = (raw: string): number | null => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(
      RESULTS_TAB_WARNING_THRESHOLD_MAX,
      Math.max(RESULTS_TAB_WARNING_THRESHOLD_MIN, parsed)
    );
  };

  const handleConfirm = async (visibility: PublishScoresVisibility) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Only forward protection when the caller wired the fieldset — VA/GL
      // stay on the original two-arg signature.
      if (showProtection) {
        // Force a final clamp from the input string so the user's last
        // keystrokes are honored even if they never blurred the field.
        const clamped = clampThreshold(thresholdInputValue);
        const finalProtection: ResultsProtection = {
          ...protection,
          tabWarningThreshold: clamped ?? protection.tabWarningThreshold,
        };
        await onConfirm(visibility, finalProtection);
      } else {
        await onConfirm(visibility);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleThresholdChange = (raw: string) => {
    // Allow free-form editing — including transiently empty values. Clamp
    // happens on blur (and as a safety net at submit time).
    setThresholdInputValue(raw);
  };

  const handleThresholdBlur = () => {
    const clamped = clampThreshold(thresholdInputValue);
    const next = clamped ?? RESULTS_PROTECTION_DEFAULTS.tabWarningThreshold;
    setProtection((p) => ({ ...p, tabWarningThreshold: next }));
    setThresholdInputValue(String(next));
  };

  const handleTabWarningToggle = (enabled: boolean) => {
    setProtection((p) => ({ ...p, tabWarningEnabled: enabled }));
    if (enabled) {
      // Re-sync the input string with the current persisted threshold so the
      // field shows a sensible value when it reappears.
      setThresholdInputValue(String(protection.tabWarningThreshold));
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
                {assignmentTitle}
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

        {showProtection && (
          <fieldset className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 space-y-2">
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Protection
            </legend>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={protection.watermarkEnabled}
                onChange={(e) =>
                  setProtection((p) => ({
                    ...p,
                    watermarkEnabled: e.target.checked,
                  }))
                }
                disabled={submitting}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
              />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-slate-900">
                  Watermark
                </span>
                <span className="block text-xs text-slate-600 leading-relaxed">
                  Overlay each result page with the student&apos;s name and the
                  publish timestamp to discourage screenshots.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={protection.tabWarningEnabled}
                onChange={(e) => handleTabWarningToggle(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
              />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-slate-900">
                  Tab-switch warning
                </span>
                <span className="block text-xs text-slate-600 leading-relaxed">
                  Warn students when they leave the results tab; lock access
                  after the threshold is reached.
                </span>
              </span>
            </label>
            {protection.tabWarningEnabled && (
              <label className="flex items-center gap-3 pl-7">
                <span className="text-xs text-slate-700">
                  Warnings before lockout
                </span>
                <input
                  type="number"
                  min={RESULTS_TAB_WARNING_THRESHOLD_MIN}
                  max={RESULTS_TAB_WARNING_THRESHOLD_MAX}
                  value={thresholdInputValue}
                  onChange={(e) => handleThresholdChange(e.target.value)}
                  onBlur={handleThresholdBlur}
                  disabled={submitting}
                  className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                />
              </label>
            )}
          </fieldset>
        )}

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
