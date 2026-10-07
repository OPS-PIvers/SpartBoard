// Vertical columns over categories (score histogram, participation), one y axis, per-mark hover.

import React from 'react';
import {
  AXIS,
  AXIS_TEXT,
  GRID,
  LABEL_TEXT,
  fillFor,
  useWidth,
  vbarPath,
} from './chartTokens';
import { ChartTooltip } from './ChartTooltip';
import { useChartTip, type TipContent } from './useChartTip';

export interface Column {
  key: string;
  x: string;
  value: number;
  bg: string;
  tip: TipContent;
  ariaLabel: string;
  /** Direct label above the column. */
  label?: string;
}

const H = 200;
const M = { l: 36, r: 8, t: 20, b: 30 };

export const ColumnChart: React.FC<{
  columns: Column[];
  yMax: number;
  yTicks: number[];
  yUnit?: string;
  ariaLabel: string;
  xTitle?: string;
  yTitle?: string;
  maxBarWidth?: number;
}> = ({
  columns,
  yMax,
  yTicks,
  yUnit = '',
  ariaLabel,
  xTitle,
  yTitle,
  maxBarWidth = 40,
}) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, bind } = useChartTip();
  const bottom = M.b + (xTitle ? 14 : 0);
  const iw = Math.max(0, width - M.l - M.r);
  const ih = H - M.t - bottom;
  const band = columns.length ? iw / columns.length : 0;
  const bw = Math.min(maxBarWidth, Math.max(4, band - 12));
  const sy = (v: number) => M.t + ih - (Math.min(v, yMax) / yMax) * ih;
  return (
    <div ref={ref} data-chart className="relative h-[200px] min-w-0">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={ariaLabel}>
          {yTicks.map((t) => (
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
                {t}
                {yUnit}
              </text>
            </g>
          ))}
          {yTitle && (
            <text x={0} y={10} className={AXIS_TEXT}>
              {yTitle}
            </text>
          )}
          {columns.map((c, i) => {
            const cx = M.l + band * i + band / 2;
            return (
              <g key={c.key} aria-label={c.ariaLabel} {...bind(c.tip)}>
                <rect
                  x={M.l + band * i}
                  y={M.t}
                  width={band}
                  height={ih}
                  className="fill-transparent"
                />
                <path
                  d={vbarPath(cx - bw / 2, sy(0), sy(c.value), bw)}
                  className={fillFor(c.bg)}
                />
                {c.label && (
                  <text
                    x={cx}
                    y={sy(c.value) - 6}
                    textAnchor="middle"
                    className={LABEL_TEXT}
                  >
                    {c.label}
                  </text>
                )}
                <text
                  x={cx}
                  y={H - bottom + 16}
                  textAnchor="middle"
                  className={AXIS_TEXT}
                >
                  {c.x}
                </text>
              </g>
            );
          })}
          {xTitle && (
            <text
              x={M.l + iw / 2}
              y={H - 2}
              textAnchor="middle"
              className={AXIS_TEXT}
            >
              {xTitle}
            </text>
          )}
        </svg>
      )}
      <ChartTooltip tip={tip} />
    </div>
  );
};
