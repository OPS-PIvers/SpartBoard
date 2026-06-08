/**
 * SchoologyAssignInstructions — the "Schoology" branch of the library-row Assign
 * chooser. Schoology's embedded assign is NOT API-creatable (it's the LTI
 * deep-link picker the teacher drives from inside Schoology), so this is a
 * how-to modal rather than an action.
 *
 * The illustrated "Add Materials → SpartBoard" diagram below is a clean,
 * swappable placeholder — replace the diagram block with a real screenshot when
 * one is available without touching the step copy.
 */
import React from 'react';
import { School, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';

interface SchoologyAssignInstructionsProps {
  quizTitle: string;
  onClose: () => void;
}

const STEPS: { n: number; text: React.ReactNode }[] = [
  { n: 1, text: 'Open your course in Schoology.' },
  {
    n: 2,
    text: (
      <>
        Click{' '}
        <span className="font-semibold text-slate-900">Add Materials</span>.
      </>
    ),
  },
  {
    n: 3,
    text: (
      <>
        Choose <span className="font-semibold text-slate-900">SpartBoard</span>{' '}
        from the list of apps.
      </>
    ),
  },
  {
    n: 4,
    text: <>Pick this quiz, then attach it to your course.</>,
  },
];

export const SchoologyAssignInstructions: React.FC<
  SchoologyAssignInstructionsProps
> = ({ quizTitle, onClose }) => {
  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="How to assign in Schoology"
      maxWidth="max-w-lg"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <School className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Add to Schoology
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[22rem]">
                {quizTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <div className="px-5 pb-5 pt-4 space-y-4">
        <p className="text-sm text-slate-600">
          Schoology assignments are added from{' '}
          <span className="font-semibold text-slate-800">inside Schoology</span>
          , not from here. It only takes a few clicks:
        </p>

        {/* Illustrated Add-Materials → SpartBoard diagram (swappable placeholder
            for a real screenshot). */}
        <div
          aria-hidden="true"
          className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-center gap-3 text-xs font-semibold"
        >
          <span className="rounded-lg bg-white border border-slate-300 px-3 py-2 text-slate-700 shadow-sm">
            + Add Materials
          </span>
          <span className="text-slate-400">›</span>
          <span className="rounded-lg bg-brand-blue-primary/10 border border-brand-blue-primary/30 px-3 py-2 text-brand-blue-dark shadow-sm">
            SpartBoard
          </span>
          <span className="text-slate-400">›</span>
          <span className="rounded-lg bg-white border border-slate-300 px-3 py-2 text-slate-700 shadow-sm">
            Pick this quiz
          </span>
        </div>

        <ol className="space-y-2.5">
          {STEPS.map((s) => (
            <li key={s.n} className="flex items-start gap-3">
              <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-brand-blue-primary text-white text-xs font-bold flex items-center justify-center">
                {s.n}
              </span>
              <span className="text-sm text-slate-700 leading-relaxed pt-0.5">
                {s.text}
              </span>
            </li>
          ))}
        </ol>

        <p className="text-xs text-slate-500 leading-relaxed">
          Students launch the quiz directly in Schoology, and their scores sync
          back to the Schoology gradebook when you publish results.
        </p>

        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-blue-dark transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
};
