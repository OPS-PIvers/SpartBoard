// Team average across common assessments: one 2px line, crosshair snapping to the nearest point.

import React, { useState } from 'react';
import type { TeamTrendPoint } from '@/utils/plcDataOverview';
import { AXIS, AXIS_TEXT, GRID, LABEL_TEXT, useWidth } from './chartTokens';
import { ChartTooltip } from './ChartTooltip';
import type { TipState } from './useChartTip';

const H = 200;
const M = { l: 36, r: 40, t: 16, b: 30 };
const fmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

export const TrendLine: React.FC<{
  points: TeamTrendPoint[];
  shortTitles: Record<string, string>;
  ariaLabel: string;
}> = ({ points, shortTitles, ariaLabel }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const iw = Math.max(0, width - M.l - M.r);
  const ih = H - M.t - M.b;
  const sx = (i: number) =>
    M.l + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const sy = (v: number) => M.t + ih - (v / 100) * ih;
  const d = points
    .map((p, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(p.teamAveragePercent)}`)
    .join('');
  const last = points[points.length - 1];
  const tipFor = (i: number): TipState => {
    const p = points[i];
    return {
      x: sx(i),
      y: sy(p.teamAveragePercent),
      content: {
        heading: `${p.title} · ${fmt.format(p.date)}`,
        rows: [
          {
            value: `${p.teamAveragePercent}%`,
            label: 'team average',
            swatch: 'bg-brand-blue-primary',
          },
          ...(p.change !== null
            ? [
                {
                  value: `${p.change > 0 ? '+' : ''}${p.change}`,
                  label: 'points from the one before',
                },
              ]
            : []),
        ],
      },
    };
  };
  const nearest = (clientX: number, box: DOMRect) => {
    const x = clientX - box.left;
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(sx(i) - x) < Math.abs(sx(best) - x)) best = i;
    });
    return best;
  };
  return (
    <div ref={ref} data-chart className="relative h-[200px] min-w-0">
      {width > 0 && points.length > 0 && (
        <svg width={width} height={H} role="img" aria-label={ariaLabel}>
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line
                x1={M.l}
                x2={width - M.r}
                y1={Math.round(sy(t)) + 0.5}
                y2={Math.round(sy(t)) + 0.5}
                className={t === 0 ? AXIS : GRID}
                shapeRendering="crispEdges"
              />
              <text
                x={M.l - 6}
                y={sy(t) + 3}
                textAnchor="end"
                className={AXIS_TEXT}
              >
                {t}%
              </text>
            </g>
          ))}
          <path
            d={d}
            className="fill-none stroke-brand-blue-primary"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p, i) => (
            <g key={p.assessmentId}>
              <circle
                cx={sx(i)}
                cy={sy(p.teamAveragePercent)}
                r={active === i ? 5 : 4}
                className="fill-brand-blue-primary stroke-white"
                strokeWidth={2}
              />
              <text
                x={sx(i)}
                y={H - M.b + 16}
                textAnchor="middle"
                className={AXIS_TEXT}
              >
                {shortTitles[p.assessmentId] ?? p.title}
              </text>
            </g>
          ))}
          {last && (
            <text
              x={sx(points.length - 1) + 8}
              y={sy(last.teamAveragePercent) + 4}
              className={LABEL_TEXT}
            >
              {last.teamAveragePercent}%
            </text>
          )}
          {active !== null && (
            <line
              x1={sx(active)}
              x2={sx(active)}
              y1={M.t}
              y2={M.t + ih}
              className={AXIS}
            />
          )}
          <rect
            x={M.l - 10}
            y={M.t}
            width={iw + 20}
            height={ih}
            className="fill-transparent focus:outline-none"
            tabIndex={0}
            aria-label={`${ariaLabel}. Use arrow keys for each assessment.`}
            onPointerMove={(e) =>
              setActive(
                nearest(
                  e.clientX,
                  (
                    e.currentTarget.ownerSVGElement as SVGSVGElement
                  ).getBoundingClientRect()
                )
              )
            }
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(points.length - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              e.preventDefault();
              const step = e.key === 'ArrowRight' ? 1 : -1;
              setActive((cur) =>
                Math.max(
                  0,
                  Math.min(points.length - 1, (cur ?? points.length - 1) + step)
                )
              );
            }}
          />
        </svg>
      )}
      <ChartTooltip tip={active === null ? null : tipFor(active)} />
    </div>
  );
};
