import React from 'react';
import { ScoreboardTeam } from '@/types';
import { Plus, Minus } from 'lucide-react';

import {
  SCOREBOARD_COLORS as TEAM_COLORS,
  ScoreboardColor,
} from '@/config/scoreboard';

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

const getStyles = (colorClass: string) => {
  return (
    COLOR_STYLES[colorClass as ScoreboardColor] ?? COLOR_STYLES['bg-blue-500']
  );
};

export const ScoreboardItem = React.memo(
  ({
    team,
    onUpdateScore,
  }: {
    team: ScoreboardTeam;
    onUpdateScore: (id: string, delta: number) => void;
  }) => {
    const colorClass = team.color ?? 'bg-blue-500';
    // Match the Randomizer group header: solid team color background, white
    // text. Buttons sit on white chips so they stay tappable against any
    // hue. Picking the exact same color class for both surfaces guarantees
    // identical rendering across widgets.
    const buttonIconColor = getStyles(colorClass).button;

    return (
      <div
        className={`flex flex-col items-center justify-center ${colorClass} text-white rounded-2xl border border-white/20 shadow-sm relative group transition-all hover:shadow-md`}
        style={{ containerType: 'size', padding: 'min(4px, 1cqmin)' }}
      >
        <div
          className="font-black uppercase tracking-widest text-white text-center line-clamp-1 w-full"
          style={{
            fontSize: 'min(15cqh, 80cqw)',
            marginBottom: 'min(2cqh, 1cqmin)',
            paddingLeft: 'min(8px, 2cqw)',
            paddingRight: 'min(8px, 2cqw)',
          }}
        >
          {team.name}
        </div>
        <div
          className="font-black text-white tabular-nums drop-shadow-sm"
          style={{
            fontSize: 'min(60cqh, 50cqw)',
            lineHeight: 1,
            marginBottom: 'min(4cqh, 2cqmin)',
          }}
        >
          {team.score}
        </div>
        <div
          className="flex opacity-100 transition-opacity"
          style={{ gap: 'min(12px, 3cqw)' }}
        >
          <button
            onClick={() => onUpdateScore(team.id, -1)}
            aria-label="Decrease score"
            className={`bg-white ${buttonIconColor} rounded-lg shadow-sm hover:bg-slate-50 active:scale-95 transition-all`}
            style={{ padding: 'min(8px, 2cqh)' }}
          >
            <Minus
              style={{
                width: 'min(12cqh, 6cqw)',
                height: 'min(12cqh, 6cqw)',
              }}
            />
          </button>
          <button
            onClick={() => onUpdateScore(team.id, 1)}
            aria-label="Increase score"
            className={`bg-white ${buttonIconColor} rounded-lg shadow-sm hover:bg-slate-50 active:scale-95 transition-all`}
            style={{ padding: 'min(8px, 2cqh)' }}
          >
            <Plus
              style={{
                width: 'min(12cqh, 6cqw)',
                height: 'min(12cqh, 6cqw)',
              }}
            />
          </button>
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
