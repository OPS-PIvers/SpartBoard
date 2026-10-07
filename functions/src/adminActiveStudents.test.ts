import { describe, it, expect, vi } from 'vitest';

vi.mock('./functionsInit', () => ({}));

import {
  OPEN_SOURCES,
  buildActiveStudentRows,
  latestOpensByStudent,
  mapWithConcurrency,
  orderSectionsForNameLookup,
  selectMonthlyActive,
} from './adminActiveStudents';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe('selectMonthlyActive', () => {
  it('keeps the last 30 days, newest first, and drops missing sign-ins', () => {
    const result = selectMonthlyActive(
      [
        { uid: 'old', sectionIds: [], lastSignInMs: NOW - 31 * DAY },
        { uid: 'a', sectionIds: [], lastSignInMs: NOW - 2 * DAY },
        { uid: 'none', sectionIds: [], lastSignInMs: 0 },
        { uid: 'b', sectionIds: [], lastSignInMs: NOW - 1000 },
      ],
      NOW
    );
    expect(result.map((s) => s.uid)).toEqual(['b', 'a']);
  });
});

describe('orderSectionsForNameLookup', () => {
  it('orders rostered sections by how many students they cover', () => {
    const order = orderSectionsForNameLookup(
      [
        { uid: 'a', sectionIds: ['s1', 's2', 'lunch'], lastSignInMs: NOW },
        { uid: 'b', sectionIds: ['s2'], lastSignInMs: NOW },
        { uid: 'c', sectionIds: ['s2', 's3'], lastSignInMs: NOW },
      ],
      new Set(['s1', 's2', 's3'])
    );
    expect(order).toEqual(['s2', 's1', 's3']);
  });
});

describe('latestOpensByStudent', () => {
  it('keeps the latest open per student and teacher', () => {
    const map = latestOpensByStudent([
      { studentUid: 'a', teacherUid: 't1', openedMs: 5 },
      { studentUid: 'a', teacherUid: 't1', openedMs: 9 },
      { studentUid: 'a', teacherUid: 't2', openedMs: 3 },
    ]);
    expect([...(map.get('a') ?? [])]).toEqual([
      ['t1', 9],
      ['t2', 3],
    ]);
  });
});

describe('buildActiveStudentRows', () => {
  it('names each teacher once with their latest open, sorted by name', () => {
    const rows = buildActiveStudentRows({
      students: [
        { uid: 'a', sectionIds: [], lastSignInMs: 50 },
        { uid: 'b', sectionIds: [], lastSignInMs: 40 },
      ],
      opensByStudent: new Map([
        [
          'a',
          new Map([
            ['t1', 30],
            ['t2', 20],
            ['t3', 10],
          ]),
        ],
      ]),
      teacherNames: new Map([
        ['t1', 'Ms. Zed'],
        ['t2', 'Mr. Adams'],
        ['t3', 'Ms. Zed'],
      ]),
      namesByUid: new Map([['a', 'Ana Lee']]),
    });
    expect(rows).toEqual([
      {
        name: 'Ana Lee',
        teachers: [
          { name: 'Mr. Adams', lastOpenedMs: 20 },
          { name: 'Ms. Zed', lastOpenedMs: 30 },
        ],
        lastSignInMs: 50,
      },
      { name: '', teachers: [], lastSignInMs: 40 },
    ]);
  });
});

describe('OPEN_SOURCES', () => {
  it('covers every assignment kind that stores the student uid', () => {
    expect(OPEN_SOURCES.map((s) => s.sessions).sort()).toEqual([
      'activity_wall_sessions',
      'guided_learning_sessions',
      'mini_app_sessions',
      'quiz_sessions',
      'video_activity_sessions',
    ]);
  });
});

describe('mapWithConcurrency', () => {
  it('runs every item with at most `limit` in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      seen.push(n);
      inFlight -= 1;
    });
    expect(peak).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
