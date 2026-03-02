import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../common/Button';
import { FileSpreadsheet, X, Send } from 'lucide-react';

/**
 * Props for the SubmitReportModal component.
 */
interface SubmitReportModalProps {
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback to submit the report data */
  onSubmit: (notes: string, extraPizza?: number) => Promise<void>;
  /** The report data to display and submit */
  data: {
    date: string;
    staffName: string;
    hotLunch: number;
    bentoBox: number;
    hotLunchName: string;
    bentoBoxName: string;
    schoolSite: 'schumann-elementary' | 'orono-intermediate-school';
    /** Formatted lunch time string, e.g. "11:30" */
    lunchTime: string;
    /** Formatted grade label for the submission row, e.g. "GR3" */
    gradeLabel: string;
    /** The fully formatted label for the spreadsheet, e.g. "11:30 - GR3 - J. Smith" */
    submissionLabel: string;
  };
  /** Whether the report is currently being submitted */
  isSubmitting: boolean;
}

/**
 * A modal dialog for reviewing and submitting a lunch count report.
 * Provides fields for additional notes and site-specific data.
 */
export const SubmitReportModal: React.FC<SubmitReportModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  data,
  isSubmitting,
}) => {
  const [notes, setNotes] = useState('');
  const [extraPizza, setExtraPizza] = useState<number | ''>('');

  // Reset form fields and close — ensures a clean slate for each new opening.
  const handleClose = useCallback(() => {
    setNotes('');
    setExtraPizza('');
    onClose();
  }, [onClose]);

  // Handle keyboard events (Escape to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, isSubmitting]);

  if (!isOpen) return null;

  const isIntermediate = data.schoolSite === 'orono-intermediate-school';

  /** The formatted label that will appear in column B of the spreadsheet */
  const columnBLabel = data.submissionLabel;

  return (
    <div
      className="absolute inset-0 z-modal flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200 rounded-3xl overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[90%] max-h-[90%] overflow-y-auto border border-slate-200 animate-in zoom-in-95 duration-200 custom-scrollbar">
        <div className="p-6 bg-brand-blue-primary/90 backdrop-blur-sm text-white flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/30 rounded-xl">
              <FileSpreadsheet className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h3
                id="report-modal-title"
                className="font-black text-lg uppercase tracking-tight"
              >
                Submit Lunch Report
              </h3>
              <p className="text-white/70 text-xxs uppercase tracking-widest font-bold">
                Review and add notes
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-2 hover:bg-white/20 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Date / Staff */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xxs font-black text-slate-400 uppercase tracking-widest">
                Date
              </span>
              <p className="text-sm font-bold text-slate-700">{data.date}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xxs font-black text-slate-400 uppercase tracking-widest">
                Staff Name
              </span>
              <p className="text-sm font-bold text-slate-700">
                {data.staffName}
              </p>
            </div>
          </div>

          {/* Spreadsheet row preview (column B) */}
          {columnBLabel && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="text-xxs font-black text-slate-400 uppercase tracking-widest block mb-1">
                Submission Label
              </span>
              <p className="text-sm font-bold text-slate-700 font-mono">
                {columnBLabel}
              </p>
            </div>
          )}

          {/* Lunch counts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-2xl border border-orange-300">
              <div className="flex flex-col">
                <span className="text-xxs font-black text-orange-600 uppercase">
                  Hot Lunch
                </span>
                <span className="text-xxs font-bold text-orange-800 line-clamp-1">
                  {data.hotLunchName}
                </span>
              </div>
              <span className="text-2xl font-black text-orange-600">
                {data.hotLunch}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-2xl border border-emerald-300">
              <div className="flex flex-col">
                <span className="text-xxs font-black text-emerald-600 uppercase">
                  Bento Box
                </span>
                <span className="text-xxs font-bold text-emerald-800 line-clamp-1">
                  {data.bentoBoxName}
                </span>
              </div>
              <span className="text-2xl font-black text-emerald-600">
                {data.bentoBox}
              </span>
            </div>

            {isIntermediate && (
              <div className="p-4 bg-purple-50 rounded-2xl border border-purple-300 flex items-center justify-between">
                <div>
                  <label
                    htmlFor="extra-pizza-input"
                    className="text-xxs font-black text-purple-600 uppercase block mb-1"
                  >
                    Extra Pizza Slices
                  </label>
                  <p className="text-xxs text-purple-400 font-bold uppercase">
                    Optional
                  </p>
                </div>
                <input
                  id="extra-pizza-input"
                  type="number"
                  min="0"
                  value={extraPizza}
                  onChange={(e) =>
                    setExtraPizza(
                      e.target.value === '' ? '' : parseInt(e.target.value)
                    )
                  }
                  placeholder="0"
                  className="w-20 p-2 text-center text-lg font-black bg-white border border-purple-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-400/20"
                />
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label
              htmlFor="report-notes"
              className="text-xxs font-black text-slate-400 uppercase tracking-widest"
            >
              Additional Notes
            </label>
            <textarea
              id="report-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Gluten Free, Field Trips, etc..."
              className="w-full h-24 p-4 text-sm font-bold bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-blue-primary/20 focus:border-brand-blue-primary transition-all resize-none shadow-inner"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 sticky bottom-0 bg-white pt-2">
            <Button
              onClick={handleClose}
              variant="secondary"
              className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                void onSubmit(notes, extraPizza === '' ? 0 : extraPizza)
              }
              variant="success"
              className="flex-[2] py-4 rounded-2xl font-black uppercase tracking-widest"
              isLoading={isSubmitting}
              icon={<Send className="w-4 h-4" />}
            >
              {isSubmitting ? 'Sending...' : 'Confirm & Submit'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
