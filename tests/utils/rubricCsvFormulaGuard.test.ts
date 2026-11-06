import { describe, it, expect } from 'vitest';
import { parseRubricCsv, rubricToCsv } from '@/utils/rubricCsv';
import type { Rubric } from '@/types';

const rubric: Rubric = {
  title: 'R',
  criteria: [
    {
      id: 'c1',
      name: '=HYPERLINK("http://evil.test","Thesis")',
      description: '@SUM(A1)',
      levels: [
        { id: 'l1', label: '+Strong', points: 4, description: '-note' },
        { id: 'l2', label: 'Weak', points: 1 },
      ],
    },
  ],
};

describe('rubricToCsv formula guard', () => {
  it('prefixes spreadsheet-formula text so it is not run on open', () => {
    const lines = rubricToCsv(rubric).split('\r\n');
    const body = lines[1];
    expect(body.startsWith(`"'=HYPERLINK(`)).toBe(true);
    expect(body).toContain(",'@SUM(A1),");
    expect(body).toContain(",'+Strong,4,'-note,");
  });

  it('round-trips the original text through import', () => {
    const parsed = parseRubricCsv(rubricToCsv(rubric));
    const c = parsed.rubric?.criteria[0];
    expect(c?.name).toBe(rubric.criteria[0].name);
    expect(c?.description).toBe('@SUM(A1)');
    expect(c?.levels[0].label).toBe('+Strong');
    expect(c?.levels[0].description).toBe('-note');
  });
});
