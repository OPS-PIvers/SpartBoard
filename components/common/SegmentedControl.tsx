import React from 'react';

/**
 * Shared segmented (pill) control. A row of mutually-exclusive options
 * rendered as a tablist, with the active option raised on a white surface.
 *
 * Promoted verbatim from `components/admin/Organization/components/primitives.tsx`
 * to `components/common/` so widget settings panels and admin config panels can
 * share a single accessible implementation instead of hand-rolling the
 * `flex bg-slate-100 p-1 rounded-*` pattern per file.
 */
export const SegmentedControl: <T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
}) => React.ReactElement = ({ value, onChange, options, ariaLabel }) => (
  <div
    role="tablist"
    aria-label={ariaLabel}
    className="inline-flex p-1 bg-slate-100 rounded-lg"
  >
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        role="tab"
        aria-selected={value === opt.value}
        onClick={() => onChange(opt.value)}
        className={`h-8 px-3 rounded-md text-xs font-semibold transition-all ${
          value === opt.value
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);
