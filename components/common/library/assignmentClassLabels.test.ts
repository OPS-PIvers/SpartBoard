import { describe, expect, it } from 'vitest';
import { classCountLabel, uniqueClassNames } from './assignmentClassLabels';

describe('uniqueClassNames', () => {
  it('drops blanks, repeats and extra spaces', () => {
    expect(
      uniqueClassNames([
        'Period  3',
        'period 3',
        '',
        '  ',
        undefined,
        'Period 4',
      ])
    ).toEqual(['Period 3', 'Period 4']);
  });
});

describe('classCountLabel', () => {
  it('counts classes', () => {
    expect(classCountLabel(1)).toBe('1 class');
    expect(classCountLabel(5)).toBe('5 classes');
  });
});
