import type {
  ScoreboardHistoryEntry,
  ScoreboardScoreChange,
  ScoreboardTeam,
} from '@/types';

export const SCOREBOARD_HISTORY_LIMIT = 50;

/** Appends one step and drops the oldest past the cap; a step with no real change is skipped. */
export const appendScoreHistory = (
  history: ScoreboardHistoryEntry[] | undefined,
  changes: ScoreboardScoreChange[],
  opts: { at?: number; kind?: 'reset' } = {}
): ScoreboardHistoryEntry[] => {
  const prev = Array.isArray(history) ? history : [];
  const real = changes.filter((c) => c.from !== c.to);
  if (real.length === 0) return prev;
  const entry: ScoreboardHistoryEntry = {
    id: crypto.randomUUID(),
    at: opts.at ?? Date.now(),
    changes: real,
  };
  if (opts.kind) entry.kind = opts.kind;
  return [...prev, entry].slice(-SCOREBOARD_HISTORY_LIMIT);
};

/** Reverses the newest step by its delta, so a change made elsewhere since then is kept. */
export const undoLastScoreChange = (
  teams: ScoreboardTeam[],
  history: ScoreboardHistoryEntry[] | undefined
): { teams: ScoreboardTeam[]; history: ScoreboardHistoryEntry[] } | null => {
  if (!Array.isArray(history) || history.length === 0) return null;
  const last = history[history.length - 1];
  const deltas = new Map<string, number>();
  for (const c of last.changes) {
    deltas.set(c.teamId, (deltas.get(c.teamId) ?? 0) + (c.from - c.to));
  }
  const nextTeams = teams.map((t) => {
    const delta = deltas.get(t.id);
    return delta ? { ...t, score: Math.max(0, t.score + delta) } : t;
  });
  return { teams: nextTeams, history: history.slice(0, -1) };
};

export interface TeamHistoryItem {
  id: string;
  at: number;
  delta: number;
  reset: boolean;
}

/** Newest-first changes for one team. */
export const teamScoreHistory = (
  history: ScoreboardHistoryEntry[] | undefined,
  teamId: string,
  limit: number
): TeamHistoryItem[] => {
  if (!Array.isArray(history)) return [];
  const items: TeamHistoryItem[] = [];
  for (let i = history.length - 1; i >= 0 && items.length < limit; i--) {
    const entry = history[i];
    const change = entry.changes.find((c) => c.teamId === teamId);
    if (!change) continue;
    items.push({
      id: entry.id,
      at: entry.at,
      delta: change.to - change.from,
      reset: entry.kind === 'reset',
    });
  }
  return items;
};

export const formatScoreDelta = (delta: number): string =>
  delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
