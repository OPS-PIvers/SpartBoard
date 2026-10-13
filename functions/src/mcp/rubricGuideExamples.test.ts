import { describe, expect, it } from 'vitest';
import { buildCriteria, rubricDoc } from './rubricTools';

const levels = [
  { label: 'Not earned', points: 0 },
  { label: 'Earned', points: 1 },
];

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

describe('buildCriteria scoring-guide examples', () => {
  it('stores trimmed examples as a guide row', () => {
    const [row] = buildCriteria(
      [
        {
          name: 'A',
          levels,
          examples: [' The study is a meta-analysis. ', ''],
        },
      ],
      [],
      ids()
    );
    expect(row.guide).toEqual({ examples: ['The study is a meta-analysis.'] });
    expect(
      rubricDoc({
        id: 'r',
        title: 't',
        criteria: [row],
        createdAt: 1,
        updatedAt: 1,
      }).criteria[0].guide
    ).toEqual(row.guide);
  });

  it('keeps the existing examples when an update omits them', () => {
    const prior = buildCriteria(
      [{ name: 'A', levels, examples: ['Kept.'] }],
      [],
      ids()
    );
    const [row] = buildCriteria(
      [{ id: prior[0].id, name: 'A renamed', levels }],
      prior,
      ids()
    );
    expect(row.guide).toEqual({ examples: ['Kept.'] });
  });

  it('leaves a levels criterion without a guide', () => {
    const [row] = buildCriteria([{ name: 'Thesis', levels }], [], ids());
    expect(row.guide).toBeUndefined();
  });
});
