import type { ScoreboardConfig, ScoreboardTeam } from '@/types';

export const SCOREBOARD_POINT_PRESETS = [
  { id: '1', values: [1] },
  { id: '1-2-3', values: [1, 2, 3] },
  { id: '1-5-10', values: [1, 5, 10] },
  { id: '5-10-25', values: [5, 10, 25] },
  { id: '10-50-100', values: [10, 50, 100] },
] as const;

export type ScoreboardPointPresetId =
  (typeof SCOREBOARD_POINT_PRESETS)[number]['id'];

const DEFAULT_POINT_VALUES: readonly number[] = [1];

/** The saved point buttons when they are one of the presets, else a single 1. */
export const scoreboardPointValues = (
  config: ScoreboardConfig,
  enabled: boolean
): readonly number[] => {
  if (!enabled || !Array.isArray(config.pointValues)) {
    return DEFAULT_POINT_VALUES;
  }
  const key = config.pointValues.join('-');
  return (
    SCOREBOARD_POINT_PRESETS.find((p) => p.id === key)?.values ??
    DEFAULT_POINT_VALUES
  );
};

export const scoreboardPointPresetId = (
  config: ScoreboardConfig
): ScoreboardPointPresetId => {
  const key = Array.isArray(config.pointValues)
    ? config.pointValues.join('-')
    : '1';
  return SCOREBOARD_POINT_PRESETS.find((p) => p.id === key)?.id ?? '1';
};

const MAX_TIED_MARKS = 3;

export type LeaderMark = 'leader' | 'tied' | null;

/** Teams sharing the top score above zero; one team leads, several are tied. */
export const scoreboardLeaders = (
  teams: ScoreboardTeam[]
): Map<string, Exclude<LeaderMark, null>> => {
  const marks = new Map<string, Exclude<LeaderMark, null>>();
  if (teams.length < 2) return marks;
  const top = Math.max(...teams.map((t) => t.score));
  if (top <= 0) return marks;
  const leaders = teams.filter((t) => t.score === top);
  // A big tie (a whole quiz class on full marks) marks nothing.
  if (leaders.length > MAX_TIED_MARKS) return marks;
  const mark = leaders.length > 1 ? 'tied' : 'leader';
  for (const team of leaders) marks.set(team.id, mark);
  return marks;
};

/** Competition rank: tied scores share a rank. */
export const scoreboardRank = (
  teams: ScoreboardTeam[],
  team: ScoreboardTeam
): number => 1 + teams.filter((t) => t.score > team.score).length;
