import type { QuizLeaderboardEntry } from '@/types';

/** Subcollection and doc under `quiz_sessions/{id}` holding leaderboard names; only seated students read it. */
export const LIVE_LEADERBOARD_COLLECTION = 'live';
export const LIVE_LEADERBOARD_DOC = 'leaderboard';

/** Names by studentUid, kept off the session doc that any signed-in user can get. */
export type LeaderboardNames = Record<string, string>;

/** Splits broadcast entries into the nameless rows for the session doc and the names map. */
export function splitLeaderboardNames(entries: QuizLeaderboardEntry[]): {
  entries: QuizLeaderboardEntry[];
  names: LeaderboardNames;
} {
  const names: LeaderboardNames = {};
  const rows = entries.map(({ name, ...rest }) => {
    if (name && rest.studentUid) names[rest.studentUid] = name;
    return rest;
  });
  return { entries: rows, names };
}

/** The names map from a stored doc, dropping anything that isn't a string. */
export function readLeaderboardNames(data: unknown): LeaderboardNames {
  const raw = (data as { names?: unknown } | undefined)?.names;
  if (!raw || typeof raw !== 'object') return {};
  const names: LeaderboardNames = {};
  for (const [uid, name] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof name === 'string' && name) names[uid] = name;
  }
  return names;
}

/** Puts names back on the rows; a row already carrying one (an older broadcast) keeps it. */
export function withLeaderboardNames(
  entries: QuizLeaderboardEntry[],
  names: LeaderboardNames | null
): QuizLeaderboardEntry[] {
  if (!names) return entries;
  return entries.map((entry) => {
    const name = entry.studentUid ? names[entry.studentUid] : undefined;
    return name && !entry.name ? { ...entry, name } : entry;
  });
}
