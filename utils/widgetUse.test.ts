import { describe, expect, it } from 'vitest';
import { needsUseStamp, withLaterUse } from './widgetUse';

const NOON = new Date(2026, 9, 20, 12).getTime();

describe('needsUseStamp', () => {
  it('stamps once per teacher per local day', () => {
    expect(needsUseStamp(undefined, 'a', NOON)).toBe(true);
    expect(needsUseStamp({ uid: 'a', at: NOON - 60_000 }, 'a', NOON)).toBe(
      false
    );
    expect(
      needsUseStamp({ uid: 'a', at: NOON - 13 * 3_600_000 }, 'a', NOON)
    ).toBe(true);
    expect(needsUseStamp({ uid: 'b', at: NOON }, 'a', NOON)).toBe(true);
  });
});

describe('withLaterUse', () => {
  it('keeps the later stamp and adds no field when neither side has one', () => {
    const early = { lastUse: { uid: 'a', at: 1 } };
    const late = { lastUse: { uid: 'a', at: 2 } };
    expect(withLaterUse(early, late)).toEqual(late);
    expect(withLaterUse(late, early)).toEqual(late);
    expect(withLaterUse({}, early)).toEqual(early);
    expect(withLaterUse({}, {})).toEqual({});
  });
});
