import { describe, expect, it } from 'vitest';
import {
  PLC_HOME_STARTER_TILES,
  currentScoredCounts,
  effectiveTiles,
  hasNewResults,
  homeSlicesFor,
  parsePlcHomeLayout,
  resolveHero,
} from './homeLayout';
import type { PlcHomeSignals } from './tileTypes';

const QUIET: PlcHomeSignals = {
  meetingInProgress: false,
  meetingDayActive: false,
  newResults: false,
};

describe('homeSlicesFor', () => {
  it('opens the union of the tiles slices', () => {
    expect([...homeSlicesFor(PLC_HOME_STARTER_TILES)].sort()).toEqual([
      'docs',
      'meetings',
      'notes',
    ]);
    expect([...homeSlicesFor([{ id: 'x', kind: 'actionsActivity' }])]).toEqual([
      'notes',
    ]);
    expect(homeSlicesFor([]).size).toBe(0);
  });
});

describe('resolveHero', () => {
  const tiles = PLC_HOME_STARTER_TILES;

  it('shows no hero when nothing asks for one', () => {
    expect(resolveHero({ tiles, heroTileId: null, signals: QUIET })).toBeNull();
  });

  it('puts a live meeting ahead of the spotlight', () => {
    expect(
      resolveHero({
        tiles,
        heroTileId: 'starter-docs',
        signals: { ...QUIET, meetingInProgress: true },
      })
    ).toBe('starter-meeting');
  });

  it('keeps the spotlight ahead of smart defaults, and skips removed tiles', () => {
    const signals = { ...QUIET, newResults: true };
    expect(resolveHero({ tiles, heroTileId: 'starter-docs', signals })).toBe(
      'starter-docs'
    );
    expect(resolveHero({ tiles, heroTileId: 'gone', signals })).toBe(
      'starter-results'
    );
    expect(
      resolveHero({
        tiles: tiles.filter((t) => t.kind !== 'meeting'),
        heroTileId: null,
        signals: { ...QUIET, meetingInProgress: true },
      })
    ).toBeNull();
  });

  it('prefers meeting day over new results', () => {
    expect(
      resolveHero({
        tiles,
        heroTileId: null,
        signals: { ...QUIET, newResults: true, meetingDayActive: true },
      })
    ).toBe('starter-meeting');
  });
});

describe('parsePlcHomeLayout', () => {
  it('keeps valid v2 tiles, drops unknown kinds and duplicate ids', () => {
    const layout = parsePlcHomeLayout({
      tiles: [
        { id: 'a', kind: 'results' },
        { id: 'a', kind: 'docs' },
        { id: 'b', kind: 'mystery' },
        { id: 'c', kind: 'perTeacher', options: { assessmentId: 'x1' } },
      ],
      heroTileId: 'c',
      seenCounts: { x1: 4, bad: 'nope' },
      updatedAt: 1,
    });
    expect(layout).toEqual({
      exists: true,
      tiles: [
        { id: 'a', kind: 'results' },
        { id: 'c', kind: 'perTeacher', options: { assessmentId: 'x1' } },
      ],
      heroTileId: 'c',
      seenCounts: { x1: 4 },
    });
  });

  it('treats a legacy bento doc as no v2 layout, but honors an emptied one', () => {
    const legacy = parsePlcHomeLayout({
      tiles: [{ kind: 'todos', size: 'lg' }],
      updatedAt: 1,
    });
    expect(legacy.tiles).toBeNull();
    expect(effectiveTiles(legacy)).toEqual(PLC_HOME_STARTER_TILES);
    expect(parsePlcHomeLayout({ tiles: [], updatedAt: 1 }).tiles).toEqual([]);
  });
});

describe('seen counts (D27)', () => {
  it('flags new results only when a count rose since the frozen visit', () => {
    expect(hasNewResults({ a: 5 }, null)).toBe(false);
    expect(hasNewResults({ a: 5 }, { a: 5 })).toBe(false);
    expect(hasNewResults({ a: 6 }, { a: 5 })).toBe(true);
    expect(hasNewResults({ b: 1 }, { a: 5 })).toBe(true);
    expect(hasNewResults({ a: 0 }, {})).toBe(false);
  });

  it('records counts for live assessments only', () => {
    expect(
      currentScoredCounts(
        [
          { assessmentId: 'a', scoredStudentCount: 7, studentCount: 9 },
          { assessmentId: 'gone', studentCount: 3 },
          { assessmentId: 'b', studentCount: 2 },
        ],
        new Set(['a', 'b'])
      )
    ).toEqual({ a: 7, b: 2 });
  });
});
