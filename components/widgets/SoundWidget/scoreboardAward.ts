import type { ScoreboardConfig, WidgetData } from '@/types';
import { appendScoreHistory } from '@/components/widgets/Scoreboard/history';

/** The Scoreboard on the board that holds this team, if it can take a point. */
export const findTeamScoreboard = (
  widgets: readonly WidgetData[],
  teamId: string
): WidgetData | undefined =>
  widgets.find((w) => {
    if (w.type !== 'scoreboard') return false;
    const config = w.config as ScoreboardConfig;
    // A live quiz drives its own scores.
    if (config.liveQuizWidgetId) return false;
    return (
      Array.isArray(config.teams) && config.teams.some((t) => t.id === teamId)
    );
  });

/** Adds one point to a team, recording it in the Scoreboard's history when that feature is on. */
export const awardPoint = (
  config: ScoreboardConfig,
  teamId: string,
  withHistory: boolean
): ScoreboardConfig => {
  const teams = Array.isArray(config.teams) ? config.teams : [];
  const before = teams.find((t) => t.id === teamId);
  if (!before) return config;
  const next: ScoreboardConfig = {
    ...config,
    teams: teams.map((t) =>
      t.id === teamId ? { ...t, score: t.score + 1 } : t
    ),
  };
  if (withHistory) {
    next.history = appendScoreHistory(config.history, [
      { teamId, from: before.score, to: before.score + 1 },
    ]);
  }
  return next;
};
