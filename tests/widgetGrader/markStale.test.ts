import { describe, it, expect } from 'vitest';
import { markStale } from '@/scripts/widget-grader/markStale';
import type { CriterionScore, Scorecard } from '@/scripts/widget-grader/types';

const entry = (over: Partial<CriterionScore>): CriterionScore => ({
  score: 2,
  source: 'judge',
  rubricVersion: '1.1.0',
  gradedAt: '2026-11-01T00:00:00Z',
  stale: false,
  ...over,
});

describe('markStale', () => {
  it('stales graded automatic scores and keeps Paul scores and N/A entries', () => {
    const card: Scorecard = {
      widgetType: 'clock',
      rubricVersion: '1.1.0',
      gradedAt: null,
      stale: false,
      criteria: {
        S1: entry({}),
        V3: entry({ source: 'paul', score: 3 }),
        I2: entry({ score: null, source: 'script' }),
        V1: entry({ source: 'script' }),
      },
      gates: {},
    };
    expect(markStale(card, ['S1', 'V3', 'I2', 'C2'])).toBe(1);
    expect(card.criteria.S1?.stale).toBe(true);
    expect(card.criteria.V3?.stale).toBe(false);
    expect(card.criteria.I2?.stale).toBe(false);
    expect(card.criteria.V1?.stale).toBe(false);
  });
});
