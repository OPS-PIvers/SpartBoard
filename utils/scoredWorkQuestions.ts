import type { Rubric } from '@/types';

export const MAX_SCORED_QUESTIONS = 60;
export const DEFAULT_SCORED_QUESTIONS = 10;

/** Index of each level in a question's two-level scale. */
export const WRONG_LEVEL = 0;
export const RIGHT_LEVEL = 1;

export const questionName = (n: number): string => `Question ${n}`;

/** A right/wrong worksheet as a rubric of one-point questions, so scoring and sharing stay one path. */
export function buildQuestionsRubric(
  title: string,
  count: number,
  now: number
): Rubric {
  const n = Math.max(1, Math.min(MAX_SCORED_QUESTIONS, Math.floor(count)));
  return {
    id: `questions-${now}`,
    title: `${title} (${n} questions)`,
    criteria: Array.from({ length: n }, (_, i) => ({
      id: `q${i + 1}`,
      name: questionName(i + 1),
      levels: [
        { id: `q${i + 1}-wrong`, label: 'Incorrect', points: 0 },
        { id: `q${i + 1}-right`, label: 'Correct', points: 1 },
      ],
    })),
    createdAt: now,
    updatedAt: now,
  };
}

/** Every question marked correct: the starting point, so a teacher only clicks the misses. */
export function allCorrect(rubric: Rubric): Record<string, number> {
  return Object.fromEntries(rubric.criteria.map((c) => [c.id, RIGHT_LEVEL]));
}
