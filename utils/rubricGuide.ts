import type { Rubric, RubricCriterion, RubricLevel } from '@/types';

/** Point ceiling for one scoring-guide row; 0..max levels must stay within the 2-6 level limit. */
export const GUIDE_MAX_POINTS = 5;

/** A scoring guide (AP-style rows with example responses) rather than a levels rubric. */
export const isScoringGuide = (rubric: Rubric): boolean =>
  rubric.criteria.some((c) => c.guide !== undefined);

export const guideRowMax = (criterion: RubricCriterion): number =>
  criterion.levels.reduce((m, l) => Math.max(m, l.points), 0);

const guideLevelLabel = (points: number, max: number): string => {
  if (max === 1) return points === 1 ? 'Earned' : 'Not earned';
  return `${points} of ${max}`;
};

/** 0..max levels for a guide row, keeping the ids of point values that already existed so saved scores still match. */
export function guideLevels(
  max: number,
  existing: RubricLevel[] = []
): RubricLevel[] {
  const clamped = Math.min(GUIDE_MAX_POINTS, Math.max(1, Math.round(max)));
  return Array.from({ length: clamped + 1 }, (_, points) => ({
    id: existing.find((l) => l.points === points)?.id ?? crypto.randomUUID(),
    label: guideLevelLabel(points, clamped),
    points,
  }));
}

export const newGuideRow = (): RubricCriterion => ({
  id: crypto.randomUUID(),
  name: '',
  levels: guideLevels(1),
  guide: { examples: [] },
});

/** Converts a rubric between templates; level wording is dropped when becoming a guide. */
export function convertRubricTemplate(
  rubric: Rubric,
  toGuide: boolean
): Rubric {
  return {
    ...rubric,
    criteria: rubric.criteria.map((c) => {
      if (toGuide) {
        if (c.guide) return c;
        return {
          ...c,
          levels: guideLevels(guideRowMax(c) || 1, c.levels),
          guide: { examples: [] },
        };
      }
      const { guide: _guide, ...rest } = c;
      return rest;
    }),
  };
}

/** Copy with every example response removed; guide rows keep their marker so they still render as a guide. */
export function stripRubricExamples(rubric: Rubric): Rubric {
  if (!isScoringGuide(rubric)) return rubric;
  return {
    ...rubric,
    criteria: rubric.criteria.map((c) => (c.guide ? { ...c, guide: {} } : c)),
  };
}

/** `{ criterionId: examples }` for rows with at least one non-empty example. */
export function rubricExamplesByCriterion(
  rubric: Rubric
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of rubric.criteria) {
    const examples = (c.guide?.examples ?? [])
      .map((e) => e.trim())
      .filter(Boolean);
    if (examples.length > 0) out[c.id] = examples;
  }
  return out;
}
