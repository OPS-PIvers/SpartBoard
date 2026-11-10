// How a bench learner plays a scenario, and what counts as a tip drawn twice (TOURS_10X.md P7).
import type { BenchScenario } from './scenarios.ts';

/** For each step, the step whose spotlight the learner waits for before clicking it; null when they don't wait or never click it. */
export function waitPlan(steps: BenchScenario['steps']): (number | null)[] {
  let runStart: number | null = null;
  return steps.map((st, i) => {
    if (st.play === 'skip') {
      runStart ??= i;
      return null;
    }
    // After skipped steps the tour is still on the first of them: the learner waits for it, then clicks ahead.
    const waitFor = runStart ?? i;
    runStart = null;
    return st.play === 'rush' ? null : waitFor;
  });
}

/** Steps whose tip came back after another step's tip, from the overlay's render marks in order. */
export function redrawnSteps(renders: { current?: number }[]): Set<number> {
  const runs = renders
    .map((m) => m.current)
    .filter((c, i, all): c is number => c !== undefined && all[i - 1] !== c);
  return new Set(runs.filter((c, i) => runs.indexOf(c) !== i));
}
