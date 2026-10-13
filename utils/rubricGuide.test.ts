import { describe, it, expect } from 'vitest';
import type { Rubric } from '@/types';
import {
  convertRubricTemplate,
  guideLevels,
  isScoringGuide,
  rubricExamplesByCriterion,
  stripRubricExamples,
} from './rubricGuide';

const guide: Rubric = {
  id: 'r1',
  title: 'Pain and group therapy',
  criteria: [
    {
      id: 'a',
      name: '(A) Research method',
      description: 'Identifies the method as a meta-analysis.',
      levels: guideLevels(1),
      guide: { examples: ['The study is a meta-analysis.', '  '] },
    },
    {
      id: 'b',
      name: '(B) Operational definition',
      levels: guideLevels(1),
      guide: { examples: [] },
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

describe('guideLevels', () => {
  it('builds 0..max levels with readable labels', () => {
    expect(guideLevels(1).map((l) => [l.points, l.label])).toEqual([
      [0, 'Not earned'],
      [1, 'Earned'],
    ]);
    expect(guideLevels(3).map((l) => l.label)).toEqual([
      '0 of 3',
      '1 of 3',
      '2 of 3',
      '3 of 3',
    ]);
  });

  it('keeps level ids for point values that already existed', () => {
    const before = guideLevels(1);
    const after = guideLevels(2, before);
    expect(after[0].id).toBe(before[0].id);
    expect(after[1].id).toBe(before[1].id);
    expect(after).toHaveLength(3);
  });

  it('caps a row at 5 points so it stays within 6 levels', () => {
    expect(guideLevels(9)).toHaveLength(6);
  });
});

describe('stripRubricExamples', () => {
  it('removes examples but keeps the guide marker', () => {
    const stripped = stripRubricExamples(guide);
    expect(stripped.criteria.map((c) => c.guide)).toEqual([{}, {}]);
    expect(isScoringGuide(stripped)).toBe(true);
    expect(stripped.criteria[0].description).toBe(
      'Identifies the method as a meta-analysis.'
    );
  });

  it('returns a levels rubric unchanged', () => {
    const levels = convertRubricTemplate(guide, false);
    expect(stripRubricExamples(levels)).toBe(levels);
  });
});

describe('rubricExamplesByCriterion', () => {
  it('lists only rows with non-blank examples', () => {
    expect(rubricExamplesByCriterion(guide)).toEqual({
      a: ['The study is a meta-analysis.'],
    });
  });
});

describe('convertRubricTemplate', () => {
  it('turns levels into a guide using the top points and back again', () => {
    const levels: Rubric = {
      ...guide,
      criteria: [
        {
          id: 'c',
          name: 'Thesis',
          levels: [
            { id: 'x', label: 'Below', points: 0 },
            { id: 'y', label: 'Meets', points: 2 },
          ],
        },
      ],
    };
    const asGuide = convertRubricTemplate(levels, true);
    expect(isScoringGuide(asGuide)).toBe(true);
    expect(asGuide.criteria[0].levels.map((l) => l.points)).toEqual([0, 1, 2]);
    expect(asGuide.criteria[0].levels[0].id).toBe('x');
    expect(isScoringGuide(convertRubricTemplate(asGuide, false))).toBe(false);
  });
});
