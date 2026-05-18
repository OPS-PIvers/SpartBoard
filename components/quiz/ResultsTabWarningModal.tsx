import React from 'react';
import { Z_INDEX } from '@/config/zIndex';

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
 *
 * Backdrop click does NOT dismiss — the student must acknowledge the warning by
 * clicking the button. Focus trap is deliberately omitted (this is a notice-style
 * modal with nothing dangerous behind it), but the dismiss button receives
 * initial focus so keyboard users can confirm with Enter immediately.
 */
export const ResultsTabWarningModal: React.FC<ResultsTabWarningModalProps> = ({
  open,
  warningCount,
  threshold,
  onDismiss,
}) => {
  const titleId = React.useId();
  if (!open) return null;
  const remaining = Math.max(0, threshold - warningCount);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ zIndex: Z_INDEX.modal }}
    >
      <div className="mx-4 max-w-md rounded-xl border border-white/20 bg-slate-900 p-6 shadow-2xl">
        <h2 id={titleId} className="text-lg font-semibold text-white">
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
          autoFocus
          onClick={onDismiss}
          className="mt-5 w-full rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue-dark"
        >
          I understand
        </button>
      </div>
    </div>
  );
};
