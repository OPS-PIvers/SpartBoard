import { describe, expect, it } from 'vitest';
import type { WidgetData } from '@/types';
import {
  keepLocalUseStamps,
  needsUseStamp,
  withLaterUse,
  withoutUseStamps,
} from './widgetUse';

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

describe('Synced share stamps', () => {
  const w = (id: string, at?: number) =>
    ({
      id,
      type: 'clock',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      z: 1,
      flipped: false,
      config: {},
      ...(at ? { lastUse: { uid: 'me', at } } : {}),
    }) as unknown as WidgetData;

  it('drops stamps from the shared copy', () => {
    const out = withoutUseStamps({ widgets: [w('a', 5), w('b')] });
    expect(out.widgets.map((x) => x.lastUse)).toEqual([undefined, undefined]);
    expect('lastUse' in out.widgets[0]).toBe(false);
  });

  it('keeps this device stamps when a remote copy arrives', () => {
    const remote = [
      { ...w('a'), lastUse: { uid: 'peer', at: 9 } },
      w('b'),
    ] as WidgetData[];
    const out = keepLocalUseStamps(remote, [w('a', 5)]);
    expect(out[0].lastUse).toEqual({ uid: 'me', at: 5 });
    expect('lastUse' in out[1]).toBe(false);
  });
});
