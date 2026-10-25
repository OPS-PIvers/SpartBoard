import { describe, expect, it } from 'vitest';
import {
  alertDelayMs,
  isCalibrating,
  noiseFloorFrom,
  resolveTargetLevel,
  targetLimit,
} from './noiseTarget';

describe('noise meter target', () => {
  it('uses the Expectations voice level while synced', () => {
    expect(resolveTargetLevel(0, true, 2)).toBe(2);
    expect(resolveTargetLevel(0, false, 2)).toBe(0);
  });

  it('has no target while synced to Expectations with no level', () => {
    expect(resolveTargetLevel(1, true, null)).toBeNull();
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

  it('takes the 80th percentile of the quiet room as the floor', () => {
    expect(noiseFloorFrom([])).toBe(0);
    expect(noiseFloorFrom([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
    expect(noiseFloorFrom([500])).toBe(128);
  });

  it('calibrates while a request is newer than the last result', () => {
    expect(isCalibrating({ calibrateRequest: 2, calibratedAt: 1 })).toBe(true);
    expect(isCalibrating({ calibrateRequest: 2, calibratedAt: 2 })).toBe(false);
    expect(isCalibrating({})).toBe(false);
  });
});
