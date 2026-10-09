import React from 'react';
import type { tourAttr } from '@/config/tourAnchors';
import {
  localInputValueToMs,
  msToLocalInputValue,
  scaledFont,
} from './assignWindowUtils';

/** `<input type="datetime-local">`-shaped labeled field, shared by the Schedule and per-period rows. */
export const WindowField: React.FC<{
  id: string;
  label: string;
  className?: string;
  value: number | undefined;
  onChange: (ms: number | undefined) => void;
  cqScaled?: boolean;
  /** Live-tour anchor attrs from `tourAttr` or `tourFieldAttr`. */
  anchor?: ReturnType<typeof tourAttr>;
}> = ({ id, label, className, value, onChange, cqScaled, anchor }) => (
  <label className={`block ${className ?? ''}`} htmlFor={id}>
    <span
      className={
        cqScaled
          ? 'font-medium text-slate-500'
          : 'text-xs font-medium text-slate-500'
      }
      style={scaledFont(cqScaled, 12, 4.5)}
    >
      {label}
    </span>
    <input
      id={id}
      type="datetime-local"
      className={
        cqScaled
          ? 'w-full rounded-md border border-slate-300 px-2 py-1 text-slate-800'
          : 'mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800'
      }
      style={
        cqScaled
          ? { marginTop: 'min(4px, 1cqmin)', ...scaledFont(cqScaled, 14, 5.5) }
          : undefined
      }
      value={msToLocalInputValue(value)}
      onChange={(e) => onChange(localInputValueToMs(e.target.value))}
      {...anchor}
    />
  </label>
);
