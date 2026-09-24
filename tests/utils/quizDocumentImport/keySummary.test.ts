import { describe, expect, it } from 'vitest';
import {
  formatLabels,
  keySummaryParts,
} from '@/utils/quizDocumentImport/keySummary';

describe('formatLabels', () => {
  it('collapses runs of numbers', () => {
    expect(formatLabels(['21', '22'])).toBe('21–22');
    expect(formatLabels(['3', '1', '2', '7'])).toBe('1–3, 7');
  });

  it('keeps printed labels as they are', () => {
    expect(formatLabels(['2·3', '5A'])).toBe('2·3, 5A');
  });
});

describe('keySummaryParts (R19)', () => {
  it('reads like the plan example', () => {
    expect(
      keySummaryParts(
        {
          entries: 22,
          matched: 18,
          unmatchedLabels: ['21', '22'],
          conflicts: 2,
        },
        20,
        3
      ).join(' · ')
    ).toBe(
      '18 of 20 questions matched · key lists 22 entries (21–22 matched no question) · 2 conflicts · 3 items unticked (not scored)'
    );
  });

  it('leaves out conflicts and unmatched when there are none', () => {
    expect(
      keySummaryParts(
        { entries: 1, matched: 1, unmatchedLabels: [], conflicts: 0 },
        1,
        0
      )
    ).toEqual(['1 of 1 question matched', 'key lists 1 entry']);
  });

  it('shows only unticked rows when there was no key', () => {
    expect(keySummaryParts(undefined, 5, 1)).toEqual([
      '1 item unticked (not scored)',
    ]);
    expect(
      keySummaryParts(
        { entries: 0, matched: 0, unmatchedLabels: [], conflicts: 0 },
        5,
        0
      )
    ).toEqual([]);
  });
});
