import { describe, expect, it } from 'vitest';
import {
  isGettingStartedRoute,
  moveGettingStartedEntry,
  normalizeGettingStartedSettings,
  normalizeGettingStartedSidebarSwitch,
  type GettingStartedEntry,
} from './gettingStarted';

const entry = (
  itemId: string,
  tier: GettingStartedEntry['tier'] = 'essentials'
): GettingStartedEntry => ({ itemId, tier, doneWhen: 'finished' });

describe('normalizeGettingStartedSettings', () => {
  it('defaults to an empty list with the sidebar item on', () => {
    expect(normalizeGettingStartedSettings(undefined)).toEqual({
      showInSidebar: true,
      tours: [],
    });
  });

  it('only an explicit false hides the sidebar item', () => {
    expect(
      normalizeGettingStartedSidebarSwitch({ showInSidebar: false }).enabled
    ).toBe(false);
    expect(normalizeGettingStartedSidebarSwitch({}).enabled).toBe(true);
    expect(
      normalizeGettingStartedSidebarSwitch({ showInSidebar: 'no' }).enabled
    ).toBe(true);
  });

  it('drops bad entries and repeats, and falls back on unknown values', () => {
    const { tours } = normalizeGettingStartedSettings({
      tours: [
        { itemId: 'a', tier: 'essentials', doneWhen: 'drive' },
        { itemId: 'a', tier: 'next' },
        { itemId: '' },
        null,
        { itemId: 'b', tier: 'other', doneWhen: 'other' },
      ],
    });
    expect(tours).toEqual([
      { itemId: 'a', tier: 'essentials', doneWhen: 'drive' },
      { itemId: 'b', tier: 'next', doneWhen: 'finished' },
    ]);
  });
});

describe('moveGettingStartedEntry', () => {
  const tours = [
    entry('a'),
    entry('x', 'next'),
    entry('b'),
    entry('y', 'next'),
  ];
  const ids = (list: GettingStartedEntry[]) => list.map((t) => t.itemId);

  it('swaps with the neighbour in the same tier, past the other tier', () => {
    expect(ids(moveGettingStartedEntry(tours, 'b', -1))).toEqual([
      'b',
      'x',
      'a',
      'y',
    ]);
    expect(ids(moveGettingStartedEntry(tours, 'x', 1))).toEqual([
      'a',
      'y',
      'b',
      'x',
    ]);
  });

  it('leaves the ends and unknown ids alone', () => {
    expect(ids(moveGettingStartedEntry(tours, 'a', -1))).toEqual(ids(tours));
    expect(ids(moveGettingStartedEntry(tours, 'y', 1))).toEqual(ids(tours));
    expect(ids(moveGettingStartedEntry(tours, 'nope', 1))).toEqual(ids(tours));
  });
});

describe('isGettingStartedRoute', () => {
  it('matches the page and nothing that only starts the same', () => {
    expect(isGettingStartedRoute('/getting-started')).toBe(true);
    expect(isGettingStartedRoute('/getting-started/')).toBe(true);
    expect(isGettingStartedRoute('/getting-started-old')).toBe(false);
    expect(isGettingStartedRoute('/')).toBe(false);
  });
});
