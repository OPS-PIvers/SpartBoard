/**
 * Shared "Attempts Allowed" segmented-control row, used by both the
 * new-assignment flow (QuizManager) and the mid-assignment settings editor
 * (QuizAssignmentSettingsModal). Keeping the options and layout in one
 * place prevents the two surfaces from drifting apart.
 */

import React from 'react';

interface AttemptOption {
  label: string;
  value: number | null;
}

const ATTEMPT_OPTIONS: AttemptOption[] = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: 'Unlimited', value: null },
];

export interface AttemptLimitRowProps {
  value: number | null;
  onChange: (v: number | null) => void;
}

export const AttemptLimitRow: React.FC<AttemptLimitRowProps> = ({
  value,
  onChange,
}) => (
  <div>
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-bold text-brand-blue-dark">
        Attempts Allowed
      </span>
      <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
        {ATTEMPT_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onChange(opt.value)}
              className={
                'px-3 py-1.5 text-xs font-bold transition ' +
                (active
                  ? 'bg-brand-blue-primary text-white'
                  : 'text-slate-600 hover:bg-slate-50')
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
    <p className="text-xxs text-slate-500 mt-0.5">
      Remove a student from the live monitor to reset their attempt.
    </p>
  </div>
);
