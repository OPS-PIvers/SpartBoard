import React, { useState } from 'react';
import { Eye, Loader2, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { PUBLISH_LEVEL_OPTIONS } from '@/components/common/library/publishScoreLevels';
import type { QuizScoreVisibility } from '@/types';
import {
  resultsExpiryFromPreset,
  type ResultsExpiryPreset,
} from '@/utils/quizResultsVisibility';

type ShownVisibility = Exclude<QuizScoreVisibility, 'none'>;

const EXPIRY_OPTIONS: { id: ResultsExpiryPreset; label: string }[] = [
  { id: 'none', label: 'No end date' },
  { id: 'today', label: 'End of today' },
  { id: '3days', label: '3 days' },
  { id: '1week', label: '1 week' },
];

interface ShowResultsDialogProps {
  /** One name, or "3 students", for the heading. */
  targetLabel: string;
  initialVisibility?: QuizScoreVisibility;
  onClose: () => void;
  onConfirm: (
    visibility: ShownVisibility,
    expiresAt: number | null
  ) => Promise<void>;
}

export const ShowResultsDialog: React.FC<ShowResultsDialogProps> = ({
  targetLabel,
  initialVisibility,
  onClose,
  onConfirm,
}) => {
  const [visibility, setVisibility] = useState<ShownVisibility>(
    initialVisibility && initialVisibility !== 'none'
      ? initialVisibility
      : 'score-only'
  );
  const [expiry, setExpiry] = useState<ResultsExpiryPreset>('none');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(visibility, resultsExpiryFromPreset(expiry));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={submitting ? () => undefined : onClose}
      ariaLabel={`Show results to ${targetLabel}`}
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <Eye className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                Show results to {targetLabel}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                The rest of the class keeps its current setting.
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
      <div className="px-5 pb-5 pt-4 space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
            What they see
          </legend>
          {PUBLISH_LEVEL_OPTIONS.map((opt) => {
            const id = opt.id as ShownVisibility;
            const active = visibility === id;
            return (
              <label
                key={id}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                  active
                    ? 'border-brand-blue-primary bg-brand-blue-lighter/30'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="student-results-level"
                  value={id}
                  checked={active}
                  onChange={() => setVisibility(id)}
                  disabled={submitting}
                  className="mt-0.5 h-4 w-4 text-brand-blue-primary focus:ring-brand-blue-primary/40"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-slate-900">
                    {opt.title}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <fieldset>
          <legend className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
            Stop showing
          </legend>
          <div className="flex flex-wrap gap-2">
            {EXPIRY_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-blue-primary/40 ${
                  expiry === opt.id
                    ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="student-results-expiry"
                  value={opt.id}
                  checked={expiry === opt.id}
                  onChange={() => setExpiry(opt.id)}
                  disabled={submitting}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="text-xs text-slate-500">
          Grades are not sent to Google Classroom or Schoology.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue-light disabled:opacity-60"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Show results
          </button>
        </div>
      </div>
    </Modal>
  );
};
