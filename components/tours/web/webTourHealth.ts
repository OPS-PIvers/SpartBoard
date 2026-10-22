import type { TourRun } from '@/components/tours/tourRuns';

export type WeakClue = 'text' | 'css' | 'score';

export type WeakCounts = Record<WeakClue, number>;

/** Real runs of the version teachers see now, with misses and weak matches by step id. */
export interface WebTourFieldStats {
  runs: number;
  done: number;
  misses: Map<string, number>;
  weak: Map<string, WeakCounts>;
}

/** Splits a run's `stepId:clue` entry, or null when it is malformed. */
export function parseWeak(
  entry: string
): { stepId: string; clue: WeakClue } | null {
  const at = entry.lastIndexOf(':');
  if (at <= 0) return null;
  const clue = entry.slice(at + 1);
  if (clue !== 'text' && clue !== 'css' && clue !== 'score') return null;
  return { stepId: entry.slice(0, at), clue };
}

/** Stats from web runs of this version only, so a republished fix clears old misses. */
export function webFieldStatsOf(
  runs: readonly TourRun[],
  version: number
): WebTourFieldStats {
  const current = runs.filter(
    (run) => run.v === version && run.surface === 'web'
  );
  const misses = new Map<string, number>();
  const weak = new Map<string, WeakCounts>();
  for (const run of current) {
    for (const id of new Set(run.misses)) {
      misses.set(id, (misses.get(id) ?? 0) + 1);
    }
    for (const entry of new Set(run.weak ?? [])) {
      const parsed = parseWeak(entry);
      if (!parsed) continue;
      const counts = weak.get(parsed.stepId) ?? {
        text: 0,
        css: 0,
        score: 0,
      };
      counts[parsed.clue]++;
      weak.set(parsed.stepId, counts);
    }
  }
  return {
    runs: current.length,
    done: current.filter((run) => run.done).length,
    misses,
    weak,
  };
}

export type WebStepState = 'ok' | 'weak' | 'missed';

/** Missed: the picture showed in a real run; weak: found only by its text or page position, or scored close to another control. */
export function webStepState(
  stepId: string,
  stats: WebTourFieldStats | null
): WebStepState {
  if (!stats) return 'ok';
  if ((stats.misses.get(stepId) ?? 0) > 0) return 'missed';
  const weak = stats.weak.get(stepId);
  return weak && weak.text + weak.css + weak.score > 0 ? 'weak' : 'ok';
}

const RANK: Record<WebStepState, number> = { ok: 0, weak: 1, missed: 2 };

/** A tour's state is its worst step's. */
export const worstWebState = (states: readonly WebStepState[]): WebStepState =>
  states.reduce<WebStepState>((w, s) => (RANK[s] > RANK[w] ? s : w), 'ok');
