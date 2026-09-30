import React from 'react';
import type { ClassRoster } from '@/types';
import {
  DEFAULT_DUE_TIME,
  dueInputsToEpoch,
  splitDueAtToInputs,
} from '@/utils/localDate';

const MODES = [
  { perClass: false, label: 'One date' },
  { perClass: true, label: 'Each class' },
] as const;

/** "One date | Each class" switch shown beside a due-date label. */
export const DueDateModeSwitch: React.FC<{
  perClass: boolean;
  onChange: (perClass: boolean) => void;
}> = ({ perClass, onChange }) => (
  <div
    role="group"
    aria-label="Due date for"
    className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden"
  >
    {MODES.map((m) => {
      const active = m.perClass === perClass;
      return (
        <button
          key={m.label}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(m.perClass)}
          className={
            'px-2.5 py-1 text-xxs font-bold transition ' +
            (active
              ? 'bg-brand-blue-primary text-white'
              : 'text-slate-600 hover:bg-slate-50')
          }
        >
          {m.label}
        </button>
      );
    })}
  </div>
);

const inputClass =
  'px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed';

/** One date + time row per selected class; `value` is epoch ms by roster id. */
export const PerClassDueDateRows: React.FC<{
  rosters: readonly ClassRoster[];
  value: Record<string, number | null>;
  onChange: (next: Record<string, number | null>) => void;
}> = ({ rosters, value, onChange }) => (
  <div className="space-y-2.5" data-testid="per-class-due-dates">
    {rosters.map((r) => {
      const due = value[r.id] ?? null;
      const inputs = splitDueAtToInputs(due, true);
      const set = (date: string, time: string) =>
        onChange({ ...value, [r.id]: dueInputsToEpoch(date, time) });
      return (
        <div key={r.id} className="space-y-1">
          <p className="text-xs font-semibold text-slate-600 break-words">
            {r.name}
          </p>
          <div className="flex gap-2">
            <input
              type="date"
              aria-label={`${r.name} due date`}
              value={inputs.date}
              onChange={(e) =>
                set(e.target.value, inputs.time || DEFAULT_DUE_TIME)
              }
              className={`flex-1 ${inputClass}`}
            />
            <input
              type="time"
              aria-label={`${r.name} due time`}
              value={inputs.time}
              disabled={!inputs.date}
              onChange={(e) =>
                set(inputs.date, e.target.value || DEFAULT_DUE_TIME)
              }
              className={`w-32 ${inputClass}`}
            />
          </div>
        </div>
      );
    })}
  </div>
);
