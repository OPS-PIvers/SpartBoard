import type { ScoreboardConfig, WidgetConnection, WidgetData } from '@/types';
import { appendScoreHistory } from '@/components/widgets/Scoreboard/history';
import { followerIds } from '@/utils/connectionEngine';

/** Scoreboards that follow this meter; while any do, only they take its points. */
export const connectedScoreboardIds = (
  connections: WidgetConnection[] | undefined,
  widgets: WidgetData[],
  meterId: string
): string[] => {
  const ids = followerIds(connections, widgets, meterId);
  return widgets
    .filter((w) => w.type === 'scoreboard' && ids.includes(w.id))
    .map((w) => w.id);
};

/** The chosen Scoreboard, if it is on the board, holds this team and can take a point. */
export const findTeamScoreboard = (
  widgets: readonly WidgetData[],
  scoreboardId: string | null | undefined,
  teamId: string,
  connectedIds: readonly string[] = []
): WidgetData | undefined =>
  widgets.find((w) => {
    if (w.type !== 'scoreboard') return false;
    if (connectedIds.length > 0 && !connectedIds.includes(w.id)) return false;
    // Every new Scoreboard starts with the same team ids, so match the widget too.
    if (scoreboardId && w.id !== scoreboardId) return false;
    const config = w.config as ScoreboardConfig;
    // A live quiz drives its own scores.
    if (config.liveQuizWidgetId) return false;
    return (
      Array.isArray(config.teams) && config.teams.some((t) => t.id === teamId)
    );
  });

/** Adds one point to a team and records it in the Scoreboard's history. */
export const awardPoint = (
  config: ScoreboardConfig,
  teamId: string
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
  next.history = appendScoreHistory(config.history, [
    { teamId, from: before.score, to: before.score + 1 },
  ]);
  return next;
};
