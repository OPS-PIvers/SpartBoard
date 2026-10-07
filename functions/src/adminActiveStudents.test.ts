import { describe, it, expect, vi } from 'vitest';

vi.mock('./functionsInit', () => ({}));

import {
  buildActiveStudentRows,
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

describe('buildActiveStudentRows', () => {
  it('lists each teacher once across co-taught and shared sections', () => {
    const rows = buildActiveStudentRows({
      students: [
        { uid: 'a', sectionIds: ['s1', 's2', 'unrostered'], lastSignInMs: 5 },
        { uid: 'b', sectionIds: ['unrostered'], lastSignInMs: 4 },
      ],
      teacherUidsBySection: new Map([
        ['s1', ['t1', 't2']],
        ['s2', ['t1']],
      ]),
      teacherNames: new Map([
        ['t1', 'Ms. Zed'],
        ['t2', 'Mr. Adams'],
      ]),
      namesByUid: new Map([['a', 'Ana Lee']]),
    });
    expect(rows).toEqual([
      { name: 'Ana Lee', teachers: ['Mr. Adams', 'Ms. Zed'], lastSignInMs: 5 },
      { name: '', teachers: [], lastSignInMs: 4 },
    ]);
  });
});
