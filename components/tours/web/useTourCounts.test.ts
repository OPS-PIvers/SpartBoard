import { describe, expect, it } from 'vitest';
import { countsText, parseTourCounts } from './useTourCounts';

describe('tour counts', () => {
  it('reads a missing or malformed doc as zeros', () => {
    expect(parseTourCounts(undefined)).toEqual({
      plays: 0,
      finished: 0,
      linkViews: 0,
    });
    expect(
      parseTourCounts({ plays: '3', finished: -1, linkViews: 2.5 })
    ).toEqual({ plays: 0, finished: 0, linkViews: 2 });
  });

  const nb = (t: string) =>
    t
      .split(' · ')
      .map((part) => part.replace(/ /g, '\u00a0'))
      .join(' · ');
  it('shows link views only once the link is on or was viewed', () => {
    const c = { plays: 1, finished: 0, linkViews: 0 };
    expect(countsText(c, false)).toBe(nb('1 play · 0 finished'));
    expect(countsText(c, true)).toBe(nb('1 play · 0 finished · 0 link views'));
    expect(countsText({ ...c, linkViews: 1 }, false)).toBe(
      nb('1 play · 0 finished · 1 link view')
    );
  });
});
