import type { Rubric, RubricCriterion, ScoredWorkScore } from '@/types';

/** Points of a criterion's top level; levels are stored low to high but never trusted to be sorted. */
export const criterionMaxPoints = (criterion: RubricCriterion): number =>
  criterion.levels.reduce((m, l) => Math.max(m, l.points), 0);

export const rubricMaxPoints = (rubric: Rubric): number =>
  rubric.criteria.reduce((sum, c) => sum + criterionMaxPoints(c), 0);

/** Keep only picks that name a real criterion and a real level of it. */
export function cleanLevels(
  rubric: Rubric,
  levels: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of rubric.criteria) {
    const pick = levels[c.id];
    if (Number.isInteger(pick) && pick >= 0 && pick < c.levels.length) {
      out[c.id] = pick;
    }
  }
  return out;
}

export const isFullyScored = (
  rubric: Rubric,
  levels: Record<string, number>
): boolean =>
  rubric.criteria.length > 0 &&
  rubric.criteria.every((c) => cleanLevels(rubric, levels)[c.id] !== undefined);

export function scoreTotals(
  rubric: Rubric,
  levels: Record<string, number>
): { points: number; max: number } {
  const clean = cleanLevels(rubric, levels);
  let points = 0;
  for (const c of rubric.criteria) {
    const pick = clean[c.id];
    if (pick !== undefined) points += c.levels[pick].points;
  }
  return { points, max: rubricMaxPoints(rubric) };
}

export const percentOf = (points: number, max: number): number =>
  max > 0 ? Math.round((points / max) * 100) : 0;

/** The doc to save for a student; null until every criterion has a level. */
export function buildScoreDoc(
  rubric: Rubric,
  seat: number,
  levels: Record<string, number>,
  now: number
): ScoredWorkScore | null {
  if (!isFullyScored(rubric, levels)) return null;
  const clean = cleanLevels(rubric, levels);
  const { points, max } = scoreTotals(rubric, clean);
  return {
    seat,
    levels: clean,
    points,
    max,
    scoredAt: now,
  };
}
