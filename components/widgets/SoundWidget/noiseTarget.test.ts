import { describe, expect, it } from 'vitest';
import { alertDelayMs, resolveTargetLevel, targetLimit } from './noiseTarget';

describe('noise meter target', () => {
  it('uses the Expectations voice level while synced', () => {
    expect(resolveTargetLevel(0, true, 2)).toBe(2);
    expect(resolveTargetLevel(0, false, 2)).toBe(0);
  });

  it('falls back to its own target when Expectations has no level', () => {
    expect(resolveTargetLevel(1, true, null)).toBe(1);
  });

  it('has no target at Outside, which nothing can exceed', () => {
    expect(resolveTargetLevel(1, true, 4)).toBeNull();
    expect(resolveTargetLevel(4, false, null)).toBeNull();
  });

  it('puts the limit where the next level starts', () => {
    expect(targetLimit(0)).toBe(20);
    expect(targetLimit(3)).toBe(80);
    expect(targetLimit(null)).toBeNull();
  });

  it('defaults and clamps the alert delay', () => {
    expect(alertDelayMs(undefined)).toBe(3000);
    expect(alertDelayMs(-2)).toBe(0);
    expect(alertDelayMs(99)).toBe(30_000);
  });
});
