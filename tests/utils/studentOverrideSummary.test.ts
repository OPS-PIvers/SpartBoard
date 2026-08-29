import { describe, it, expect } from 'vitest';
import { summarizeOverride } from '@/utils/studentOverrideSummary';
import type { StudentOverride } from '@/types';

describe('summarizeOverride', () => {
  it('returns no chips for an empty override', () => {
    expect(summarizeOverride({})).toEqual([]);
  });

  it('summarizes each override dimension', () => {
    const override: StudentOverride = {
      timeMultiplier: 2,
      questionIds: ['q1'],
      hiddenOptionIdsByQuestion: { q1: ['b'] },
      rubricOverrideByQuestion: { q2: 'points' },
      tabWarningThreshold: 'off',
      openAt: 1,
    };
    expect(summarizeOverride(override, { totalQuestions: 2 })).toEqual([
      '2x time',
      '1/2 Qs',
      '1 option(s) hidden',
      '1 rubric swap(s)',
      'Tab warnings off',
      'Window shifted',
    ]);
  });

  it('reports unlimited time and a numeric tab-warning threshold', () => {
    expect(
      summarizeOverride({ timeMultiplier: 'unlimited', tabWarningThreshold: 5 })
    ).toEqual(['Unlimited time', 'Tab warning: 5']);
  });
});
