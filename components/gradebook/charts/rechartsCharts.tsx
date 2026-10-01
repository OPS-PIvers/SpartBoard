import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProficiencyScale } from '@/utils/gradebook/gradebookCore';
import {
  histogramBins,
  type HistogramBin,
} from '@/utils/gradebook/gradebookAnalysis';
import { bandFor, scaleCutoffs } from './bands';

const AXIS = {
  fontSize: 11,
  fill: '#64748b',
  fontFamily: 'Lexend, sans-serif',
};
const BLUE = '#2d3f89';
const SLATE = '#64748b';

const TipBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-md">
    {children}
  </div>
);

export interface ScoreHistogramProps {
  values: number[];
  scale: ProficiencyScale;
  ariaLabel: string;
  height?: number;
  onSelectBin?: (bin: HistogramBin) => void;
}

export const ScoreHistogramImpl: React.FC<ScoreHistogramProps> = ({
  values,
  scale,
  ariaLabel,
  height = 180,
  onSelectBin,
}) => {
  const bins = histogramBins(values, scale).map((b) => ({
    ...b,
    band: bandFor(b.min, scale),
  }));
  const top = Math.max(1, ...bins.map((b) => b.count));
  const ticks = [...new Set([0, Math.ceil(top / 2), top])];
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={bins}
          margin={{ top: 8, right: 0, bottom: 0, left: -24 }}
        >
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            ticks={ticks}
            domain={[0, top]}
            allowDecimals={false}
            tick={AXIS}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(45,63,137,0.06)' }}
            content={({ active, payload }) => {
              const b = active
                ? (payload?.[0]?.payload as (typeof bins)[number] | undefined)
                : undefined;
              if (!b) return null;
              return (
                <TipBox>
                  <b>{b.label}</b> · {b.band?.name}
                  <div>
                    {b.count} {b.count === 1 ? 'student' : 'students'}
                  </div>
                </TipBox>
              );
            }}
          />
          <Bar
            dataKey="count"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            cursor={onSelectBin ? 'pointer' : undefined}
            onClick={
              onSelectBin
                ? (d: unknown) => {
                    const p = (d as { payload?: HistogramBin }).payload;
                    if (p) onSelectBin(p);
                  }
                : undefined
            }
          >
            {bins.map((b) => (
              <Cell
                key={b.label}
                fill={b.band?.hex ?? SLATE}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export interface TrendPoint {
  id: string;
  /** X-axis label, e.g. a short due date. */
  label: string;
  title: string;
  pct: number | null;
  median: number | null;
  /** A flag value (Missing as 0) produced this score. */
  zeroed?: boolean;
}

export interface ScoreTrendChartProps {
  points: TrendPoint[];
  scale: ProficiencyScale;
  ariaLabel?: string;
  height?: number;
  seriesLabel?: string;
  medianLabel?: string;
  onSelect?: (id: string) => void;
}

export const ScoreTrendChartImpl: React.FC<ScoreTrendChartProps> = ({
  points,
  scale,
  ariaLabel = 'Score trend',
  height = 200,
  seriesLabel = 'Score',
  medianLabel = 'Class median',
  onSelect,
}) => (
  <div role="img" aria-label={ariaLabel} style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={points}
        margin={{ top: 10, right: 10, bottom: 0, left: -20 }}
        onClick={(state: unknown) => {
          const idx = (state as { activeTooltipIndex?: number | string } | null)
            ?.activeTooltipIndex;
          const p = idx === undefined ? undefined : points[Number(idx)];
          if (p && onSelect) onSelect(p.id);
        }}
      >
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis
          domain={[0, 100]}
          ticks={[0, ...scaleCutoffs(scale), 100]}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine y={0} stroke="#e2e8f0" />
        <ReferenceLine y={100} stroke="#e2e8f0" />
        {scaleCutoffs(scale).map((y) => (
          <ReferenceLine key={y} y={y} stroke="#e2e8f0" strokeDasharray="3 3" />
        ))}
        <Tooltip
          content={({ active, payload }) => {
            const p = active
              ? (payload?.[0]?.payload as TrendPoint | undefined)
              : undefined;
            if (!p) return null;
            const band = bandFor(p.pct, scale);
            return (
              <TipBox>
                <b>{p.title}</b>
                <div>
                  {seriesLabel}:{' '}
                  {p.pct === null ? '–' : `${Math.round(p.pct)}%`}
                  {band ? ` · ${band.name}` : ''}
                  {p.zeroed ? ' · Missing' : ''}
                </div>
                <div>
                  {medianLabel}:{' '}
                  {p.median === null ? '–' : `${Math.round(p.median)}%`}
                </div>
              </TipBox>
            );
          }}
        />
        <Line
          dataKey="median"
          stroke={SLATE}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          dataKey="pct"
          stroke={BLUE}
          strokeWidth={2.5}
          connectNulls
          isAnimationActive={false}
          dot={(props: {
            cx?: number;
            cy?: number;
            index?: number;
            payload?: TrendPoint;
          }) => {
            const { cx, cy, index, payload } = props;
            if (
              cx === undefined ||
              cy === undefined ||
              !payload ||
              payload.pct === null
            ) {
              return <g key={index} />;
            }
            return (
              <circle
                key={index}
                cx={cx}
                cy={cy}
                r={4}
                fill={payload.zeroed ? '#ad2122' : BLUE}
              />
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);
