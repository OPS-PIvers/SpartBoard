import type {
  Rubric,
  RubricCriterion,
  RubricLevel,
  RubricLevelOrder,
  WrittenAnswerRubricScore,
} from '@/types';

/** Sum of each criterion's highest level points — a rubric-scored question's max points. */
export const rubricMaxPoints = (rubric: Rubric): number =>
  rubric.criteria.reduce(
    (sum, c) => sum + c.levels.reduce((max, l) => Math.max(max, l.points), 0),
    0
  );

/** Running total of selected criterion levels; non-finite points count as 0. */
export const sumRubricScorePoints = (
  scores: WrittenAnswerRubricScore[] | undefined
): number =>
  (scores ?? []).reduce(
    (total, s) => total + (Number.isFinite(s.points) ? s.points : 0),
    0
  );

/** Levels in the teacher's order, by points; ties keep their saved order. */
export const orderRubricLevels = (
  levels: RubricLevel[],
  order: RubricLevelOrder
): RubricLevel[] => {
  const sign = order === 'high-first' ? -1 : 1;
  return levels
    .map((level, i) => ({ level, i }))
    .sort((a, b) => sign * (a.level.points - b.level.points) || a.i - b.i)
    .map((x) => x.level);
};

export const criterionMaxPoints = (criterion: RubricCriterion): number =>
  criterion.levels.reduce((max, l) => Math.max(max, l.points), 0);
