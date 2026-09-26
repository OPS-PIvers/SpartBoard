import React from 'react';
import { ScoreboardTeam } from '@/types';
import { Plus, Minus } from 'lucide-react';

import {
  SCOREBOARD_COLORS as TEAM_COLORS,
  ScoreboardColor,
  normalizeScoreboardColor,
} from '@/config/scoreboard';
import { tourFieldAttr } from '@/config/tourAnchors';

const COLOR_STYLES: Record<
  ScoreboardColor,
  { label: string; score: string; button: string }
> = {
  'bg-sky-500': {
    label: 'text-sky-600',
    score: 'text-sky-700',
    button: 'text-sky-700',
  },
  'bg-blue-500': {
    label: 'text-blue-600',
    score: 'text-blue-700',
    button: 'text-blue-700',
  },
  'bg-indigo-500': {
    label: 'text-indigo-600',
    score: 'text-indigo-700',
    button: 'text-indigo-700',
  },
  'bg-violet-500': {
    label: 'text-violet-600',
    score: 'text-violet-700',
    button: 'text-violet-700',
  },
  'bg-purple-500': {
    label: 'text-purple-600',
    score: 'text-purple-700',
    button: 'text-purple-700',
  },
  'bg-fuchsia-500': {
    label: 'text-fuchsia-600',
    score: 'text-fuchsia-700',
    button: 'text-fuchsia-700',
  },
  'bg-pink-500': {
    label: 'text-pink-600',
    score: 'text-pink-700',
    button: 'text-pink-700',
  },
  'bg-rose-500': {
    label: 'text-rose-600',
    score: 'text-rose-700',
    button: 'text-rose-700',
  },
  'bg-red-500': {
    label: 'text-red-600',
    score: 'text-red-700',
    button: 'text-red-700',
  },
  'bg-orange-500': {
    label: 'text-orange-600',
    score: 'text-orange-700',
    button: 'text-orange-700',
  },
  'bg-amber-500': {
    label: 'text-amber-600',
    score: 'text-amber-700',
    button: 'text-amber-700',
  },
  'bg-yellow-500': {
    label: 'text-yellow-600',
    score: 'text-yellow-700',
    button: 'text-yellow-700',
  },
  'bg-lime-500': {
    label: 'text-lime-600',
    score: 'text-lime-700',
    button: 'text-lime-700',
  },
  'bg-green-500': {
    label: 'text-green-600',
    score: 'text-green-700',
    button: 'text-green-700',
  },
  'bg-emerald-500': {
    label: 'text-emerald-600',
    score: 'text-emerald-700',
    button: 'text-emerald-700',
  },
  'bg-teal-600': {
    label: 'text-teal-600',
    score: 'text-teal-700',
    button: 'text-teal-700',
  },
  'bg-cyan-500': {
    label: 'text-cyan-600',
    score: 'text-cyan-700',
    button: 'text-cyan-700',
  },
  'bg-slate-600': {
    label: 'text-slate-600',
    score: 'text-slate-700',
    button: 'text-slate-700',
  },
};

const getStyles = (colorClass: ScoreboardColor) => COLOR_STYLES[colorClass];

export const ScoreboardItem = React.memo(
  ({
    team,
    teamPosition = 1,
    widgetId,
    onUpdateScore,
  }: {
    team: ScoreboardTeam;
    teamPosition?: number;
    widgetId?: string;
    onUpdateScore: (id: string, delta: number) => void;
  }) => {
    const fieldKey = `team-${teamPosition}`;
    // Normalize the persisted color through the known-palette set before
    // it lands in className — an unknown value would interpolate into
    // `bg-something-500` that Tailwind has no rule for, leaving white
    // text on no background. The helper also logs once per unknown
    // value so stale-data regressions surface in dev console.
    const colorClass = normalizeScoreboardColor(team.color);
    const buttonIconColor = getStyles(colorClass).button;

    // Digit-aware sizing, per layout: stacked gets the full card width minus
    // padding; side-by-side gets whatever the two button chips leave behind.
    const digitCount = Math.max(String(team.score ?? 0).length, 1);
    const stackedFontSize = `clamp(16px, min(${Math.min(
      70,
      125 / digitCount
    ).toFixed(1)}cqw, 40cqh), 220px)`;
    const sideFontSize = `clamp(16px, min(calc((100cqw - 72cqh) / ${(
      0.62 * digitCount
    ).toFixed(2)}), 50cqh), 220px)`;

    return (
      <div
        className={`${colorClass} text-white rounded-2xl border border-white/20 shadow-sm relative group transition-all hover:shadow-md`}
        style={{ containerType: 'size' }}
      >
        {/* Padding lives inside so its cqmin resolves against the card, not the board. */}
        <div
          className="flex flex-col items-center justify-center h-full w-full"
          style={{ padding: 'clamp(4px, 5cqmin, 24px)' }}
        >
          <div
            className="font-black uppercase tracking-widest text-white text-center line-clamp-1 w-full shrink-0"
            style={{
              fontSize: 'clamp(10px, 10cqmin, 48px)',
              marginBottom: 'clamp(2px, 2cqmin, 12px)',
              paddingLeft: 'clamp(2px, 2cqmin, 12px)',
              paddingRight: 'clamp(2px, 2cqmin, 12px)',
            }}
          >
            {team.name}
          </div>
          {/* Wraps to score-over-buttons on portrait cards; one row once the card is clearly wider than tall. */}
          <div
            className="flex flex-wrap content-center items-center justify-center w-full flex-1 min-h-0 [@container(min-aspect-ratio:1.4)]:flex-nowrap"
            style={{ gap: 'clamp(4px, 4cqmin, 24px)' }}
          >
            <button
              onClick={() => onUpdateScore(team.id, -1)}
              aria-label="Decrease score"
              {...tourFieldAttr(
                'scoreboard.remove-point',
                'scoreboard',
                fieldKey
              )}
              data-tour-widget={widgetId}
              className={`bg-white ${buttonIconColor} rounded-lg shadow-sm hover:bg-slate-50 active:scale-95 transition-all shrink-0 flex items-center justify-center`}
              style={{ padding: 'clamp(4px, 6cqmin, 28px)' }}
            >
              <Minus
                style={{
                  width: 'clamp(12px, 14cqmin, 56px)',
                  height: 'clamp(12px, 14cqmin, 56px)',
                }}
              />
            </button>
            {/* --fs-pick is only set inside the container query, so the fallback picks the stacked size. */}
            <div
              className="order-first basis-full font-black text-white tabular-nums drop-shadow-sm text-center min-w-0 leading-none [@container(min-aspect-ratio:1.4)]:order-none [@container(min-aspect-ratio:1.4)]:basis-auto [@container(min-aspect-ratio:1.4)]:flex-1 [@container(min-aspect-ratio:1.4)]:[--fs-pick:var(--fs-side)]"
              style={
                {
                  '--fs-side': sideFontSize,
                  fontSize: `var(--fs-pick, ${stackedFontSize})`,
                } as React.CSSProperties
              }
            >
              {team.score}
            </div>
            <button
              onClick={() => onUpdateScore(team.id, 1)}
              aria-label="Increase score"
              {...tourFieldAttr('scoreboard.add-point', 'scoreboard', fieldKey)}
              data-tour-widget={widgetId}
              className={`bg-white ${buttonIconColor} rounded-lg shadow-sm hover:bg-slate-50 active:scale-95 transition-all shrink-0 flex items-center justify-center`}
              style={{ padding: 'clamp(4px, 6cqmin, 28px)' }}
            >
              <Plus
                style={{
                  width: 'clamp(12px, 14cqmin, 56px)',
                  height: 'clamp(12px, 14cqmin, 56px)',
                }}
              />
            </button>
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // ⚡ BOLT OPTIMIZATION: Custom props equality check to prevent unnecessary re-renders.
    // The `team` prop is an object that may be recreated by the parent component,
    // even if its content hasn't changed. By doing a shallow comparison of its
    // specific primitive properties instead of relying on default object equality,
    // we prevent all `ScoreboardItem`s from re-rendering when only a single team's score updates.
    return (
      prevProps.onUpdateScore === nextProps.onUpdateScore &&
      prevProps.teamPosition === nextProps.teamPosition &&
      prevProps.widgetId === nextProps.widgetId &&
      prevProps.team.id === nextProps.team.id &&
      prevProps.team.name === nextProps.team.name &&
      prevProps.team.score === nextProps.team.score &&
      prevProps.team.color === nextProps.team.color &&
      prevProps.team.linkedGroupId === nextProps.team.linkedGroupId
    );
  }
);

ScoreboardItem.displayName = 'ScoreboardItem';

export { TEAM_COLORS };
