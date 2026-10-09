import React, { useState } from 'react';
import { Toggle } from '@/components/common/Toggle';
import type { tourAttr } from '@/config/tourAnchors';

export const StepRowLabel: React.FC<{ text: string; sub?: boolean }> = ({
  text,
  sub = false,
}) => (
  <span
    className={
      sub
        ? 'min-w-0 text-sm font-medium text-slate-700'
        : 'min-w-0 text-sm font-bold text-brand-blue-dark'
    }
  >
    {text}
  </span>
);

export const StepRow: React.FC<{
  label: string;
  sub?: boolean;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, sub, hint, children }) => (
  <div>
    <div className="flex min-h-[2rem] items-center justify-between gap-3">
      <StepRowLabel text={label} sub={sub} />
      {children}
    </div>
    {hint && <p className="text-xxs text-slate-500">{hint}</p>}
  </div>
);

export const StepToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  sub?: boolean;
  disabled?: boolean;
  hint?: string;
  /** Rendered left of the toggle (a number field while the setting is on). */
  field?: React.ReactNode;
  anchor?: ReturnType<typeof tourAttr>;
}> = ({ label, checked, onChange, sub, disabled, hint, field, anchor }) => (
  <StepRow label={label} sub={sub} hint={hint}>
    <span className="flex shrink-0 items-center gap-2">
      {field}
      <Toggle
        checked={checked}
        onChange={onChange}
        size="sm"
        showLabels
        label={label}
        disabled={disabled}
        anchor={anchor}
      />
    </span>
  </StepRow>
);

/** Whole-number input that clamps and commits on blur or Enter. */
export const StepNumberField: React.FC<{
  value: number;
  min: number;
  max: number;
  onCommit: (next: number) => void;
  ariaLabel: string;
  unit?: string;
  widthClass?: string;
}> = ({ value, min, max, onCommit, ariaLabel, unit, widthClass = 'w-16' }) => {
  const [draft, setDraft] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }
  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    const next = Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, parsed))
      : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <span className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className={`${widthClass} rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-blue-primary`}
      />
      {unit && <span className="text-xs text-slate-500">{unit}</span>}
    </span>
  );
};

/** Indented sub-settings under a parent toggle. */
export const StepSubRows: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="ml-1 space-y-1.5 border-l-2 border-slate-100 pl-3">
    {children}
  </div>
);
