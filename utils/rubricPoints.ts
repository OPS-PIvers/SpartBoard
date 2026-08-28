import type { Rubric, WrittenAnswerRubricScore } from '@/types';

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
