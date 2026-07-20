import { describe, it, expect } from 'vitest';
import * as Icons from 'lucide-react';
import { COMMON_INSTRUCTIONAL_ICONS } from './instructionalIcons';

describe('COMMON_INSTRUCTIONAL_ICONS', () => {
  it('every entry resolves to a real lucide-react icon export', () => {
    // TypeScript can't catch a bad name here (plain `string[]`); consumers silently return null, so the option just vanishes — this test is the only safety net.
    const invalid = COMMON_INSTRUCTIONAL_ICONS.filter(
      (name) =>
        (Icons as unknown as Record<string, unknown>)[name] === undefined
    );
    expect(invalid).toEqual([]);
  });

  it('has no duplicate icon names', () => {
    const seen = new Set(COMMON_INSTRUCTIONAL_ICONS);
    expect(seen.size).toBe(COMMON_INSTRUCTIONAL_ICONS.length);
  });
});
