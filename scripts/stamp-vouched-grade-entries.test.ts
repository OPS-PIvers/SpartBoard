import { describe, expect, it } from 'vitest';
import {
  matchRows,
  parseRecords,
  projectionKey,
  retouchTargets,
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
      touches: [
        { sessionId: 'a', ownerUid: 't1', rowId: 'quiz__a__u1' },
        { sessionId: 'a', ownerUid: 't1', rowId: 'a__u1' },
      ],
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

describe('retouch', () => {
  const rec = (path: string, sessionId: string) => ({
    path,
    sessionId,
    ownerUid: 't1',
    rowId: `quiz__${sessionId}__u1`,
  });

  it('keeps only well-formed records', () => {
    expect(
      parseRecords([
        rec('student_grades/u1/classes/c1', 'a'),
        { ...rec('student_grades/u1/classes/c1', 'b'), rowId: 'x/y' },
        { ...rec('users/t1/x/y', 'c') },
        { path: 'student_grades/u1/classes/c1', sessionId: 'd' },
        'junk',
      ])
    ).toEqual([rec('student_grades/u1/classes/c1', 'a')]);
    expect(parseRecords({})).toEqual([]);
  });

  it('re-touches rows whose entry or whole doc is gone', () => {
    const records = [
      rec('student_grades/u1/classes/c1', 'kept'),
      rec('student_grades/u1/classes/c1', 'dropped'),
      rec('student_grades/u2/classes/c1', 'docGone'),
    ];
    const docs = new Map([
      ['student_grades/u1/classes/c1', { entries: { kept: { pct: 80 } } }],
    ]);
    expect(
      retouchTargets(records, docs).map(
        (r: { sessionId: string }) => r.sessionId
      )
    ).toEqual(['dropped', 'docGone']);
  });
});
