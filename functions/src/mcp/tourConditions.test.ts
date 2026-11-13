import { describe, expect, it } from 'vitest';
import { isTourConditionRef } from './tourConditions';

describe('isTourConditionRef', () => {
  it('accepts facts, live features and retired features', () => {
    expect(isTourConditionRef('building-saved')).toBe(true);
    expect(isTourConditionRef('feature:sparty')).toBe(true);
    expect(isTourConditionRef('feature:spell-check-setting')).toBe(true);
  });

  it('rejects unknown refs', () => {
    expect(isTourConditionRef('feature:no-such-feature')).toBe(false);
    expect(isTourConditionRef('building')).toBe(false);
  });
});
