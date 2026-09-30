import React from 'react';
import { handleRadioGroupKeyDown } from './radioGroupKeyNav';

/**
 * Shared segmented (pill) control. A row of mutually-exclusive options
 * rendered as a tablist, with the active option raised on a white surface.
 *
 * Promoted verbatim from `components/admin/Organization/components/primitives.tsx`
 * to `components/common/` so widget settings panels and admin config panels can
 * share a single accessible implementation instead of hand-rolling the
 * `flex bg-slate-100 p-1 rounded-*` pattern per file.
 *
 * Implements the tablist keyboard pattern (select-follows-focus, roving
 * tabIndex) — see `sessionViews/SegmentedTabs.tsx` for the reference
 * implementation this mirrors. Role/tabpanel wiring is a separate, unfinished
 * concern (no consumer here actually navigates into a panel).
 *
 * `role="radiogroup"` renders the same pill as radio buttons for a setting
 * that switches nothing into view; arrow keys still move the selection.
 */
export const SegmentedControl: <T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; badge?: React.ReactNode }[];
  ariaLabel?: string;
  role?: 'tablist' | 'radiogroup';
}) => React.ReactElement = ({
  value,
  onChange,
  options,
  ariaLabel,
  role = 'tablist',
}) => {
  const itemRole = role === 'radiogroup' ? 'radio' : 'tab';
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) =>
    handleRadioGroupKeyDown(e, options, (opt) => onChange(opt.value));

  return (
    <div
      role={role}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="inline-flex p-1 bg-slate-100 rounded-lg"
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role={itemRole}
            tabIndex={selected ? 0 : -1}
            aria-selected={itemRole === 'tab' ? selected : undefined}
            aria-checked={itemRole === 'radio' ? selected : undefined}
            onClick={() => onChange(opt.value)}
            className={`${opt.badge ? 'inline-flex items-center gap-1.5 ' : ''}h-8 px-3 rounded-md text-xs font-semibold transition-all ${
              selected
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {opt.label}
            {opt.badge}
          </button>
        );
      })}
    </div>
  );
};
