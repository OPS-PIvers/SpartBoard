// Goal progress meter (T21): the mock's GoalMeter drawing with translated labels and an optional baseline.

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  AXIS,
  AXIS_TEXT,
  LABEL_TEXT,
  hbarPath,
  useWidth,
} from '@/components/plc/redesignMockup/charts/chartTokens';

const H = 72;
const Y = 28;
const BAR_H = 14;

export const GoalProgressMeter: React.FC<{
  current: number;
  target: number;
  baseline?: number;
}> = ({ current, target, baseline }) => {
  const { t } = useTranslation();
  const [ref, width] = useWidth<HTMLDivElement>();
  const sx = (v: number) => (v / 100) * (width - 2) + 1;
  const nowText = t('plcDataOverview.pctNow', {
    pct: `${current}%`,
    defaultValue: '{{pct}} now',
  });
  const goalText = t('plcDataOverview.goalPct', {
    pct: `${target}%`,
    defaultValue: 'Goal {{pct}}',
  });
  const baselineText =
    baseline === undefined
      ? null
      : t('plcDataOverview.baselinePct', {
          pct: `${baseline}%`,
          defaultValue: 'Baseline {{pct}}',
        });
  const marks: [number, string, 'start' | 'end'][] = [
    ...(baseline !== undefined && baselineText
      ? [[baseline, baselineText, 'end'] as [number, string, 'end']]
      : []),
    [target, goalText, 'start'],
  ];
  return (
    <div
      ref={ref}
      data-testid="goal-meter"
      className="relative h-[72px] min-w-0"
    >
      {width > 0 && (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={[nowText, baselineText, goalText]
            .filter(Boolean)
            .join(', ')}
        >
          <rect
            x={sx(0)}
            y={Y}
            width={sx(100) - sx(0)}
            height={BAR_H}
            rx={4}
            className="fill-slate-100"
          />
          <path
            d={hbarPath(sx(0), sx(current), Y, BAR_H)}
            className="fill-brand-blue-primary"
          />
          {marks.map(([v, label, anchor]) => (
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
            {nowText}
          </text>
        </svg>
      )}
    </div>
  );
};
