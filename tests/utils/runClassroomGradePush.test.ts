import { describe, it, expect } from 'vitest';
import {
  isPushPermissionDenied,
  hasValidMaxPoints,
} from '@/utils/runClassroomGradePush';

describe('isPushPermissionDenied', () => {
  it('is true for a Firebase callable permission-denied code', () => {
    expect(
      isPushPermissionDenied({ code: 'functions/permission-denied' })
    ).toBe(true);
    expect(isPushPermissionDenied({ code: 'permission-denied' })).toBe(true);
  });

  it('is false for a different string code', () => {
    expect(isPushPermissionDenied({ code: 'functions/unavailable' })).toBe(
      false
    );
  });

  it('is false (and does NOT throw) when code is a number', () => {
    // Regression: a non-Firebase error can carry a numeric code (e.g. 403 from
    // a raw Google API error). `.includes()` on a number would throw and turn a
    // handled error into an unhandled one if the type isn't guarded.
    expect(() => isPushPermissionDenied({ code: 403 })).not.toThrow();
    expect(isPushPermissionDenied({ code: 403 })).toBe(false);
  });

  it('is false for null, undefined, and non-objects', () => {
    expect(isPushPermissionDenied(null)).toBe(false);
    expect(isPushPermissionDenied(undefined)).toBe(false);
    // A bare string isn't a callable error — we only inspect `.code`.
    expect(isPushPermissionDenied('permission-denied')).toBe(false);
    // A plain Error has no `.code`; its message is intentionally not consulted.
    expect(isPushPermissionDenied(new Error('permission-denied'))).toBe(false);
  });
});

describe('hasValidMaxPoints', () => {
  it('is true only for a positive, finite number', () => {
    expect(hasValidMaxPoints(20)).toBe(true);
    expect(hasValidMaxPoints(0)).toBe(false);
    expect(hasValidMaxPoints(-5)).toBe(false);
    expect(hasValidMaxPoints(Number.NaN)).toBe(false);
    expect(hasValidMaxPoints(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
