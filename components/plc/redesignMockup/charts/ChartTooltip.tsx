// Hover detail for the chart kit, in the slate-800 tooltip style used by the gradebook settings.

import React from 'react';
import type { TipState } from './useChartTip';

export const ChartTooltip: React.FC<{ tip: TipState | null }> = ({ tip }) => {
  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 w-max max-w-xs -translate-x-1/2 -translate-y-full rounded-lg bg-slate-800 px-2.5 py-2 text-xs font-medium text-white shadow-lg"
      style={{ left: tip.x, top: tip.y - 10 }}
    >
      <div className="mb-1 font-bold">{tip.content.heading}</div>
      {tip.content.rows.map((row) => (
        <div key={row.label + row.value} className="flex items-center gap-1.5">
          {row.swatch && (
            <span
              className={`h-2 w-2 shrink-0 rounded-sm ${row.swatch}`}
              aria-hidden="true"
            />
          )}
          <span className="font-bold tabular-nums">{row.value}</span>
          <span className="text-slate-300">{row.label}</span>
        </div>
      ))}
    </div>
  );
};

/** Key for multi-series charts; identity never rides on colour alone. */
export const ChartLegend: React.FC<{
  items: { label: string; swatch: string }[];
}> = ({ items }) => (
  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
    {items.map((item) => (
      <span key={item.label} className="inline-flex items-center gap-1.5">
        <span
          className={`h-2.5 w-2.5 rounded-sm ${item.swatch}`}
          aria-hidden="true"
        />
        {item.label}
      </span>
    ))}
  </span>
);
