// Horizontal stacked bar rows (item analysis, mastery by target, task status): label, bar, value.

import React from 'react';
import { AXIS, GRID, fillFor, hbarPath, useWidth } from './chartTokens';
import { ChartTooltip } from './ChartTooltip';
import { useChartTip, type TipContent } from './useChartTip';

export interface BarSegment {
  value: number;
  /** Background class from the shared score colours, mapped to an SVG fill. */
  bg: string;
}

export interface BarRow {
  key: string;
  label: React.ReactNode;
  segments: BarSegment[];
  value: React.ReactNode;
  tip: TipContent;
  ariaLabel: string;
  /** Hairline above this row, e.g. after the reteach group. */
  breakBefore?: boolean;
}

const ROW_H = 32;
const BAR_H = 14;
const GAP = 2;

const BarCell: React.FC<{
  row: BarRow;
  max: number;
  ticks: number[];
  bind: ReturnType<typeof useChartTip>['bind'];
}> = ({ row, max, ticks, bind }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const sx = (v: number) => (v / max) * Math.max(0, width - 1);
  const y = (ROW_H - BAR_H) / 2;
  const segments = row.segments.filter((s) => s.value > 0);
  const starts = segments.map((_, i) =>
    segments.slice(0, i).reduce((sum, s) => sum + sx(s.value), 0)
  );
  return (
    <div ref={ref} className="h-8 min-w-0">
      {width > 0 && (
        <svg
          width={width}
          height={ROW_H}
          role="img"
          aria-label={row.ariaLabel}
          {...bind(row.tip)}
        >
          {ticks.map((t) => (
            <line
              key={t}
              x1={sx(t) + 0.5}
              x2={sx(t) + 0.5}
              y1={0}
              y2={ROW_H}
              className={t === 0 ? AXIS : GRID}
              shapeRendering="crispEdges"
            />
          ))}
          {segments.map((s, i) => {
            const x0 = starts[i] + (i ? GAP : 0);
            const x1 = starts[i] + sx(s.value);
            const last = i === segments.length - 1;
            return last ? (
              <path
                key={i}
                d={hbarPath(x0, x1, y, BAR_H)}
                className={fillFor(s.bg)}
              />
            ) : (
              <rect
                key={i}
                x={x0}
                y={y}
                width={Math.max(0, x1 - x0)}
                height={BAR_H}
                className={fillFor(s.bg)}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
};

export const BarRows: React.FC<{
  rows: BarRow[];
  max?: number;
  ticks?: number[];
  unit?: string;
  /** Tailwind grid template for label / bar / value. */
  columns?: string;
}> = ({
  rows,
  max = 100,
  ticks = [0, 25, 50, 75, 100],
  unit = '%',
  columns = 'grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,13rem)]',
}) => {
  const { tip, bind } = useChartTip();
  return (
    <div data-chart className="relative">
      <div className={`grid ${columns} items-center gap-x-4`}>
        {rows.map((row) => (
          <React.Fragment key={row.key}>
            {row.breakBefore && (
              <div
                className="col-span-3 my-1 border-t border-slate-200"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0 text-sm text-slate-700">{row.label}</div>
            <BarCell row={row} max={max} ticks={ticks} bind={bind} />
            <div className="min-w-0 text-xs text-slate-500">{row.value}</div>
          </React.Fragment>
        ))}
        <div />
        <div className="relative h-5" aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-1 -translate-x-1/2 text-xxs tabular-nums text-slate-500"
              style={{ left: `${(t / max) * 100}%` }}
            >
              {t}
              {unit}
            </span>
          ))}
        </div>
        <div />
      </div>
      <ChartTooltip tip={tip} />
    </div>
  );
};
