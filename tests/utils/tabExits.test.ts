import { describe, it, expect } from 'vitest';
import type { TabExit } from '@/types';
import {
  describeTabExit,
  formatTabAwayTotal,
  openTabExit,
  totalAwayMs,
} from '@/utils/tabExits';

const ctx = { completed: false, sessionEnded: false, now: 100_000 };
const open: TabExit = { leftAt: 70_000, attempt: 0, questionIndex: 3 };
const closed: TabExit = {
  leftAt: 10_000,
  attempt: 0,
  videoTime: 65,
  durationMs: 12_000,
  outcome: 'auto-submitted',
};

describe('describeTabExit', () => {
  it('reads a closed exit as written', () => {
    expect(describeTabExit(closed, ctx)).toEqual({
      leftAt: 10_000,
      on: '1:05',
      awayMs: 12_000,
      status: 'auto-submitted',
    });
  });

  it('ticks an open exit live', () => {
    expect(describeTabExit(open, ctx)).toMatchObject({
      on: 'Q4',
      awayMs: 30_000,
      status: 'away-now',
    });
  });

  it('marks an open exit session-ended once the session is over', () => {
    expect(describeTabExit(open, { ...ctx, sessionEnded: true })).toMatchObject(
      { awayMs: null, status: 'session-ended' }
    );
  });

  it('marks an open exit on a submitted response', () => {
    expect(describeTabExit(open, { ...ctx, completed: true })).toMatchObject({
      awayMs: null,
      status: 'submitted-away',
    });
  });
});

describe('helpers', () => {
  it('finds the open exit only when it is last', () => {
    expect(openTabExit([closed, open])).toBe(open);
    expect(openTabExit([open, closed])).toBeNull();
    expect(openTabExit(undefined)).toBeNull();
  });

  it('totals the rows that have a duration', () => {
    const rows = [closed, open].map((e) => describeTabExit(e, ctx));
    expect(totalAwayMs(rows)).toBe(42_000);
  });

  it('formats the export cell, blank without a log', () => {
    expect(formatTabAwayTotal([closed, open])).toBe('0:12');
    expect(formatTabAwayTotal(undefined)).toBe('');
  });
});
