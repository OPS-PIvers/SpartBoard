// Table view behind every chart, so no number is only readable from a mark.

import React from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

export const DataTable: React.FC<{
  head: string[];
  rows: React.ReactNode[][];
  caption?: string;
  /** Per-column alignment; by default the first column is left and the rest right. */
  align?: ('left' | 'right')[];
}> = ({ head, rows, caption, align }) => {
  const right = (i: number) => (align ? align[i] === 'right' : i > 0);
  return (
    <table className="w-full text-sm">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr className="border-b border-slate-200">
          {head.map((h, i) => (
            <th
              key={h}
              scope="col"
              className={`py-2 text-xxs font-bold uppercase tracking-wider text-slate-500 ${i ? 'pl-4' : ''} ${right(i) ? 'text-right' : 'text-left'}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, i) => (
              <td
                key={i}
                className={`py-2 ${i ? 'pl-4 tabular-nums text-slate-600' : 'text-slate-800'} ${right(i) ? 'text-right' : ''}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/** "Table" / "Chart" switch beside a chart heading. */
export const TableToggle: React.FC<{
  table: boolean;
  onToggle: () => void;
  anchor?: TourAnchorAttrs;
}> = ({ table, onToggle, anchor }) => (
  <button
    type="button"
    aria-pressed={table}
    onClick={onToggle}
    {...anchor}
    className="rounded text-xs font-semibold text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
  >
    {table ? 'Chart' : 'Table'}
  </button>
);
