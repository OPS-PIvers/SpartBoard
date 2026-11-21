import { describe, expect, it } from 'vitest';
import {
  matchRows,
  projectionKey,
  unstampedEntries,
} from './stamp-vouched-grade-entries.mjs';

describe('unstampedEntries', () => {
  it('lists entries with an owner but no vouched stamp', () => {
    expect(
      unstampedEntries({
        entries: {
          a: { ownerUid: 't1', pct: 80 },
          b: { ownerUid: 't1', vouched: true },
          c: { pct: 50 },
          d: { ownerUid: 't2', vouched: false },
          e: 'junk',
        },
      })
    ).toEqual([
      { sessionId: 'a', ownerUid: 't1' },
      { sessionId: 'd', ownerUid: 't2' },
    ]);
  });

  it('copes with a doc that has no entries', () => {
    expect(unstampedEntries({})).toEqual([]);
    expect(unstampedEntries(undefined)).toEqual([]);
  });
});

describe('matchRows', () => {
  const rows = [
    {
      id: 'quiz__a__u1',
      data: { sessionId: 'a', ownerUid: 't1', classId: 'c1' },
    },
    { id: 'a__u1', data: { sessionId: 'a', ownerUid: 't1', classId: 'c1' } },
    {
      id: 'quiz__b__u1',
      data: { sessionId: 'b', ownerUid: 't9', classId: 'c1' },
    },
    {
      id: 'quiz__c__u1',
      data: { sessionId: 'c', ownerUid: 't1', classId: 'c2' },
    },
  ];

  it("touches only the entry owner's row in this class", () => {
    expect(
      matchRows(
        [
          { sessionId: 'a', ownerUid: 't1' },
          { sessionId: 'b', ownerUid: 't1' },
          { sessionId: 'c', ownerUid: 't1' },
        ],
        rows,
        'c1'
      )
    ).toEqual({
      rowIds: ['quiz__a__u1', 'a__u1'],
      missing: [
        { sessionId: 'b', ownerUid: 't1' },
        { sessionId: 'c', ownerUid: 't1' },
      ],
    });
  });
});

describe('projectionKey', () => {
  it('reads only student_grades class docs', () => {
    expect(projectionKey('student_grades/u1/classes/c1')).toEqual({
      studentUid: 'u1',
      classId: 'c1',
    });
    expect(projectionKey('users/t1/classes/c1')).toBeNull();
    expect(projectionKey('student_grades/u1/classes/c1/x/y')).toBeNull();
  });
});
