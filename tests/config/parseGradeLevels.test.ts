import { describe, it, expect } from 'vitest';
import { parseGradeLevels } from '@/config/buildings';

describe('parseGradeLevels', () => {
  it.each([
    ['3–5', ['3-5']],
    ['3—5', ['3-5']],
    ['Grades 3-5', ['3-5']],
    ['grade 3 to 5', ['3-5']],
    ['K to 2', ['k-2']],
    ['6 – 8', ['6-8']],
  ])('parses %s', (input, expected) => {
    expect(parseGradeLevels(input)).toEqual(expected);
  });

  it('does not match Object prototype keys', () => {
    expect(parseGradeLevels('constructor')).toEqual([]);
  });
});
