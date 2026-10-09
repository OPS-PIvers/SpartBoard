import React from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

export const FIELD =
  'h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30 disabled:bg-slate-50 disabled:text-slate-500';
export const ICON_BTN =
  'h-[30px] w-[30px] inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30 disabled:opacity-50 disabled:pointer-events-none';
export const LINK_BTN =
  'text-xs font-semibold text-brand-blue-primary hover:underline focus:outline-none focus-visible:underline';
/** Text or number field that commits on blur or Enter and resets when the stored value changes. */
export const CommitInput: React.FC<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
    value: string;
    onCommit: (value: string) => void;
  }
> = ({ value, onCommit, className = '', ...rest }) => (
  <input
    key={value}
    defaultValue={value}
    className={`${FIELD} ${className}`}
    onBlur={(e) => {
      if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
    }}
    onKeyDown={(e) => {
      if (e.key === 'Enter') e.currentTarget.blur();
      if (e.key === 'Escape') {
        e.currentTarget.value = value;
        e.currentTarget.blur();
      }
    }}
    {...rest}
  />
);

export const PctInput: React.FC<{
  value: number | null;
  onCommit: (v: string) => void;
  disabled: boolean;
  label: string;
  min?: number;
  max?: number;
  placeholder?: string;
  compact?: boolean;
  anchor?: TourAnchorAttrs;
}> = ({
  value,
  onCommit,
  disabled,
  label,
  min = 0,
  max = 100,
  placeholder,
  compact = false,
  anchor,
}) => (
  <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
    <CommitInput
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value === null ? '' : String(value)}
      onCommit={onCommit}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={label}
      {...anchor}
      className={compact ? '!h-8 w-[68px] !pl-2 !pr-1' : 'w-[76px]'}
    />
    <span>%</span>
  </span>
);
