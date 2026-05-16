import React from 'react';

interface ResultsTabWarningModalProps {
  /** Visible only when the student just returned from a tab switch. */
  open: boolean;
  warningCount: number;
  threshold: number;
  onDismiss: () => void;
}

/**
 * Shown after the student returns to the results tab. Modal copy reveals the
 * current count and threshold ("Warning 2 of 3") so the student can self-correct
 * rather than treating lockout as a black-box gotcha.
 */
export const ResultsTabWarningModal: React.FC<ResultsTabWarningModalProps> = ({
  open,
  warningCount,
  threshold,
  onDismiss,
}) => {
  if (!open) return null;
  const remaining = Math.max(0, threshold - warningCount);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="results-tab-warning-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="mx-4 max-w-md rounded-xl border border-white/20 bg-slate-900 p-6 shadow-2xl">
        <h2
          id="results-tab-warning-title"
          className="text-lg font-semibold text-white"
        >
          Stay on this tab
        </h2>
        <p className="mt-3 text-sm text-white/80">
          You left the results page. Your teacher is tracking this.
        </p>
        <p className="mt-2 text-sm font-medium text-amber-300">
          Warning {warningCount} of {threshold}
          {remaining > 0
            ? ` — ${remaining} more will lock you out.`
            : ' — next time you leave, you will be locked out.'}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-5 w-full rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue-dark"
        >
          I understand
        </button>
      </div>
    </div>
  );
};
