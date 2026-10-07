// Progress toward a team goal with baseline and goal marks.

import React from 'react';
import { AXIS, AXIS_TEXT, LABEL_TEXT, hbarPath, useWidth } from './chartTokens';
import { ChartTooltip } from './ChartTooltip';
import { useChartTip } from './useChartTip';

const H = 72;
const Y = 28;
const BAR_H = 14;

export const GoalMeter: React.FC<{
  now: number;
  baseline: number;
  goal: number;
  measure: string;
  nowSource: string;
  baselineSource: string;
  goalDate: string;
}> = ({
  now,
  baseline,
  goal,
  measure,
  nowSource,
  baselineSource,
  goalDate,
}) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, bind } = useChartTip();
  const sx = (v: number) => (v / 100) * (width - 2) + 1;
  return (
    <div ref={ref} data-chart className="relative h-[72px] min-w-0">
      {width > 0 && (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`${now}% now, baseline ${baseline}%, goal ${goal}%`}
        >
          <rect
            x={sx(0)}
            y={Y}
            width={sx(100) - sx(0)}
            height={BAR_H}
            rx={4}
            className="fill-slate-100"
          />
          <g
            {...bind({
              heading: measure,
              rows: [
                {
                  value: `${now}%`,
                  label: nowSource,
                  swatch: 'bg-brand-blue-primary',
                },
                { value: `${baseline}%`, label: baselineSource },
                { value: `${goal}%`, label: `goal by ${goalDate}` },
              ],
            })}
          >
            <path
              d={hbarPath(sx(0), sx(now), Y, BAR_H)}
              className="fill-brand-blue-primary"
            />
          </g>
          {(
            [
              [baseline, `Baseline ${baseline}%`, 'end'],
              [goal, `Goal ${goal}%`, 'start'],
            ] as const
          ).map(([v, label, anchor]) => (
            <g key={label}>
              <line
                x1={sx(v)}
                x2={sx(v)}
                y1={Y - 8}
                y2={Y + BAR_H + 4}
                className="stroke-slate-600"
                strokeWidth={1.5}
              />
              <text
                x={sx(v) + (anchor === 'end' ? -4 : 4)}
                y={Y - 10}
                textAnchor={anchor}
                className={AXIS_TEXT}
              >
                {label}
              </text>
            </g>
          ))}
          <line
            x1={sx(0)}
            x2={sx(0)}
            y1={Y - 4}
            y2={Y + BAR_H + 4}
            className={AXIS}
          />
          <text x={sx(0)} y={Y + BAR_H + 20} className={LABEL_TEXT}>
            {now}% now
          </text>
        </svg>
      )}
      <ChartTooltip tip={tip} />
    </div>
  );
};
