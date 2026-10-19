import { describe, expect, it } from 'vitest';
import { buildScoreDoc, rubricMaxPoints } from './scoredWorkMath';
import {
  MAX_SCORED_QUESTIONS,
  RIGHT_LEVEL,
  WRONG_LEVEL,
  allCorrect,
  buildQuestionsRubric,
} from './scoredWorkQuestions';

describe('buildQuestionsRubric', () => {
  it('makes one point per question with a wrong and a right level', () => {
    const r = buildQuestionsRubric('Quiz', 5, 1);
    expect(r.criteria).toHaveLength(5);
    expect(r.criteria[0].name).toBe('Question 1');
    expect(rubricMaxPoints(r)).toBe(5);
    expect(r.criteria[0].levels.map((l) => l.points)).toEqual([0, 1]);
  });

  it('clamps the count to a sensible range', () => {
    expect(buildQuestionsRubric('Q', 0, 1).criteria).toHaveLength(1);
    expect(buildQuestionsRubric('Q', 500, 1).criteria).toHaveLength(
      MAX_SCORED_QUESTIONS
    );
  });

  it('scores a student who missed two of five', () => {
    const r = buildQuestionsRubric('Quiz', 5, 1);
    const levels: Record<string, number> = {
      ...allCorrect(r),
      q2: WRONG_LEVEL,
      q4: WRONG_LEVEL,
    };
    const doc = buildScoreDoc(r, 1, levels, 9);
    expect(doc).toMatchObject({ points: 3, max: 5 });
    expect(levels.q1).toBe(RIGHT_LEVEL);
  });
});
