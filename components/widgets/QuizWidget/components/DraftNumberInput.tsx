import React, { useState } from 'react';
import type { tourFieldAttr } from '@/config/tourAnchors';
import { inputClass } from './quizEditorFieldStyles';

export interface DraftNumberInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'min' | 'max'
> {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  /** Rounds the committed value; off for decimal fields like a number-line step. */
  integer?: boolean;
  /** Saves valid numbers on each keystroke; off for fields where a partial value would reshape the page. */
  commitWhileTyping?: boolean;
  /** Short unit shown inside the field's right edge, e.g. "Sec". */
  unit?: string;
  anchor?: ReturnType<typeof tourFieldAttr>;
}

/** Number field that keeps what the teacher types and clamps on blur or Enter, so "1" on the way to "120" is never snapped to the minimum. */
export const DraftNumberInput: React.FC<DraftNumberInputProps> = ({
  value,
  onCommit,
  min,
  max,
  integer = false,
  commitWhileTyping = true,
  unit,
  anchor,
  className,
  onBlur,
  onKeyDown,
  ...rest
}) => {
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number) => {
    let next = integer ? Math.round(n) : n;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    return next;
  };
  const inRange = (n: number) =>
    (min === undefined || n >= min) &&
    (max === undefined || n <= max) &&
    (!integer || Number.isInteger(n));

  const commit = () => {
    if (draft === null) return;
    const n = parseFloat(draft);
    setDraft(null);
    if (!Number.isFinite(n)) return;
    const next = clamp(n);
    if (next !== value) onCommit(next);
  };

  const input = (
    <input
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      min={min}
      max={max}
      value={draft ?? String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        // Saves as the teacher types whenever the number is already valid.
        if (!commitWhileTyping) return;
        const n = parseFloat(raw);
        if (Number.isFinite(n) && inRange(n) && n !== value) onCommit(n);
      }}
      onBlur={(e) => {
        commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        onKeyDown?.(e);
      }}
      className={`${inputClass} ${unit ? 'pr-11' : ''} ${className ?? ''}`}
      {...anchor}
      {...rest}
    />
  );

  if (!unit) return input;
  return (
    <div className="relative">
      {input}
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xxs uppercase tracking-wider">
        {unit}
      </span>
    </div>
  );
};
