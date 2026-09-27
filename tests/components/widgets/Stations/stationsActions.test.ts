import { describe, it, expect } from 'vitest';
import { Station } from '@/types';
import {
  rotateAssignments,
  shuffleStudentsIntoStations,
  resetAllAssignments,
  resetStation,
} from '@/components/widgets/Stations/hooks/stationsActions';

const makeStation = (
  id: string,
  order: number,
  maxStudents?: number
): Station => ({
  id,
  title: id.toUpperCase(),
  color: '#10b981',
  order,
  maxStudents,
});

describe('rotateAssignments', () => {
  it('cycles students clockwise through three stations', () => {
    const stations = [
      makeStation('a', 0),
      makeStation('b', 1),
      makeStation('c', 2),
    ];
    const before = {
      Alice: 'a',
      Bob: 'a',
      Carol: 'b',
      Dave: 'c',
    };
    const { assignments, stuckStudents } = rotateAssignments(stations, before);
    expect(stuckStudents).toEqual([]);
    expect(assignments).toEqual({
      Alice: 'b',
      Bob: 'b',
      Carol: 'c',
      Dave: 'a',
    });
  });

  it('returns unchanged assignments when stations array is empty', () => {
    const before = { Alice: 'a' };
    const { assignments, stuckStudents } = rotateAssignments([], before);
    expect(assignments).toBe(before);
    expect(stuckStudents).toEqual([]);
  });

  it('preserves unassigned (null) entries', () => {
    const stations = [makeStation('a', 0), makeStation('b', 1)];
    const before = { Alice: null, Bob: 'a' };
    const { assignments } = rotateAssignments(stations, before);
    expect(assignments.Alice).toBeNull();
    expect(assignments.Bob).toBe('b');
  });

  it('overflows displaced students to the next under-cap station', () => {
    // Cap b at 1 — when rotating, only one of Alice/Bob can land in b; the
    // other must keep walking to c.
    const stations = [
      makeStation('a', 0),
      makeStation('b', 1, 1),
      makeStation('c', 2),
    ];
    const before = { Alice: 'a', Bob: 'a' };
    const { assignments, stuckStudents } = rotateAssignments(stations, before);
    expect(stuckStudents).toEqual([]);
    // First student in 'a' fills 'b', second flows to 'c'.
    expect(assignments).toEqual({ Alice: 'b', Bob: 'c' });
  });

  it('reports stuck students when every station is full and keeps them put', () => {
    // Three students, two stations each capped at 1 → total capacity 2 < 3.
    // The first two rotate fine, the third has nowhere to land.
    const stations = [makeStation('a', 0, 1), makeStation('b', 1, 1)];
    const before: Record<string, string | null> = {
      Alice: 'a',
      Bob: 'a',
      Carol: 'b',
    };
    const { assignments, stuckStudents } = rotateAssignments(stations, before);
    expect(stuckStudents).toHaveLength(1);
    // Every student still has an assignment somewhere.
    expect(Object.keys(assignments).sort()).toEqual(['Alice', 'Bob', 'Carol']);
    // The stuck student kept their original station.
    const stuck = stuckStudents[0];
    expect(assignments[stuck]).toBe(before[stuck]);
  });
});

describe('shuffleStudentsIntoStations', () => {
  it('distributes students evenly across stations with no caps', () => {
    const stations = [
      makeStation('a', 0),
      makeStation('b', 1),
      makeStation('c', 2),
    ];
    const roster = ['s1', 's2', 's3', 's4', 's5', 's6'];
    const { assignments, overflowStudents } = shuffleStudentsIntoStations(
      stations,
      roster
    );
    expect(overflowStudents).toEqual([]);
    // 6 students across 3 stations → exactly 2 each.
    const aCount = Object.values(assignments).filter((v) => v === 'a').length;
    const bCount = Object.values(assignments).filter((v) => v === 'b').length;
    const cCount = Object.values(assignments).filter((v) => v === 'c').length;
    expect(aCount).toBe(2);
    expect(bCount).toBe(2);
    expect(cCount).toBe(2);
    // Every roster member is placed somewhere.
    expect(Object.keys(assignments).sort()).toEqual([...roster].sort());
  });

  it('respects capacity caps and reports overflow', () => {
    const stations = [makeStation('a', 0, 2), makeStation('b', 1, 2)];
    const roster = ['s1', 's2', 's3', 's4', 's5'];
    const { assignments, overflowStudents } = shuffleStudentsIntoStations(
      stations,
      roster,
      () => 0
    );
    // Total capacity = 4, roster = 5 → exactly one overflow student.
    expect(overflowStudents).toHaveLength(1);
    const placed = Object.values(assignments).filter((v) => v != null);
    expect(placed).toHaveLength(4);
    // Each cap respected.
    const aCount = Object.values(assignments).filter((v) => v === 'a').length;
    const bCount = Object.values(assignments).filter((v) => v === 'b').length;
    expect(aCount).toBe(2);
    expect(bCount).toBe(2);
  });

  it('returns all-unassigned when there are no stations', () => {
    const roster = ['s1', 's2'];
    const { assignments, overflowStudents } = shuffleStudentsIntoStations(
      [],
      roster
    );
    expect(assignments).toEqual({ s1: null, s2: null });
    expect(overflowStudents).toEqual(['s1', 's2']);
  });

  it('returns empty result for empty stations and empty roster', () => {
    const result = shuffleStudentsIntoStations([], []);
    expect(result.assignments).toEqual({});
    expect(result.overflowStudents).toEqual([]);
  });

  it('skips a station with maxStudents = 0 instead of looping forever', () => {
    // Stale data path: a station the teacher set to 0 capacity. The
    // round-robin must not infinite-loop trying to place students there.
    const stations = [
      makeStation('a', 0, 0),
      makeStation('b', 1),
      makeStation('c', 2),
    ];
    const roster = ['s1', 's2', 's3', 's4'];
    const { assignments, overflowStudents } = shuffleStudentsIntoStations(
      stations,
      roster
    );
    // No one lands in 'a'.
    const aCount = Object.values(assignments).filter((v) => v === 'a').length;
    expect(aCount).toBe(0);
    // Everyone is placed in b or c (4 people across 2 unbounded stations).
    expect(overflowStudents).toEqual([]);
    expect(Object.keys(assignments).sort()).toEqual(roster);
  });
});

describe('rotateAssignments — extra cases', () => {
  it('drops students assigned to a no-longer-present station back to unassigned', () => {
    // Station 'b' was deleted between assignment and rotate. Carol's stale
    // assignment must not pin her to a phantom station, and she must not be
    // silently lost — the algorithm carries her over as unassigned (null).
    const stations = [makeStation('a', 0), makeStation('c', 1)];
    const before: Record<string, string | null> = {
      Alice: 'a',
      Bob: 'c',
      Carol: 'b', // station 'b' is no longer in the stations array
    };
    const { assignments } = rotateAssignments(stations, before);
    // Alice and Bob rotate normally.
    expect(assignments.Alice).toBe('c');
    expect(assignments.Bob).toBe('a');
    // Carol survives the rotate but is now unassigned.
    expect('Carol' in assignments).toBe(true);
    expect(assignments.Carol).toBeNull();
  });

  it('handles a station whose existing members exceed maxStudents (cap was lowered)', () => {
    const stations = [
      makeStation('a', 0, 1),
      makeStation('b', 1, 1),
      makeStation('c', 2, 1),
    ];
    // 'a' currently has 2 students even though cap is 1 — happens when the
    // teacher lowers maxStudents after assignment.
    const before: Record<string, string | null> = {
      Alice: 'a',
      Bob: 'a',
    };
    const { assignments, stuckStudents } = rotateAssignments(stations, before);
    // Both rotate forward and find slots in b/c.
    expect(stuckStudents).toEqual([]);
    const placed = Object.values(assignments).filter((v) => v != null);
    expect(placed).toHaveLength(2);
  });
});

describe('resetAllAssignments', () => {
  it('returns a map with every roster entry set to null', () => {
    const result = resetAllAssignments(['Alice', 'Bob', 'Carol']);
    expect(result).toEqual({ Alice: null, Bob: null, Carol: null });
  });
});

describe('resetStation', () => {
  it('clears only members of the named station', () => {
    const before = { Alice: 'a', Bob: 'a', Carol: 'b', Dave: null };
    const result = resetStation(before, 'a');
    expect(result).toEqual({ Alice: null, Bob: null, Carol: 'b', Dave: null });
  });
});

/**
 * Constraint-aware shuffle (docs/plans/shipped/ROSTER_GROUPS_INTEGRATION.md D15).
 * Before this, `shuffleStudentsIntoStations` was a plain Fisher-Yates that
 * honoured neither a locked class group nor the roster's own
 * `restrictedStudentIds` — the latter had been ignored since Stations shipped.
 */
describe('shuffleStudentsIntoStations — constraints', () => {
  const sameStation = (
    assignments: Record<string, string | null>,
    ids: string[]
  ) => new Set(ids.map((id) => assignments[id])).size === 1;

  it('keeps a locked cohort in one station across every seeding', () => {
    const stations = [
      makeStation('a', 0),
      makeStation('b', 1),
      makeStation('c', 2),
    ];
    const roster = ['s1', 's2', 's3', 's4', 's5', 's6'];
    for (let seed = 0; seed < 25; seed++) {
      const { assignments } = shuffleStudentsIntoStations(
        stations,
        roster,
        () => seed / 25,
        { keepTogether: [['s1', 's2', 's3']] }
      );
      expect(sameStation(assignments, ['s1', 's2', 's3'])).toBe(true);
    }
  });

  it('keeps restricted students apart when a station has room', () => {
    // `() => 0` fixes the order to s2, s3, s4, s1, which round-robins s2 and
    // s4 into the same station. The constraint has to move one of them, so
    // the assertion fails if keep-apart is ignored rather than passing by luck.
    const stations = [makeStation('a', 0), makeStation('b', 1)];
    const roster = ['s1', 's2', 's3', 's4'];
    const { assignments, apartConflicts } = shuffleStudentsIntoStations(
      stations,
      roster,
      () => 0,
      {
        keepApart: new Map([
          ['s2', new Set(['s4'])],
          ['s4', new Set(['s2'])],
        ]),
      }
    );
    expect(assignments.s2).not.toBe(assignments.s4);
    expect(apartConflicts).toEqual([]);
  });

  it('reports a keep-apart pair it could not separate', () => {
    // One station, so the pair has nowhere else to go. Lock-style precedence:
    // everyone is still placed, and the caller is told what gave way.
    const stations = [makeStation('a', 0)];
    const { assignments, apartConflicts } = shuffleStudentsIntoStations(
      stations,
      ['s1', 's2'],
      Math.random,
      { keepApart: new Map([['s1', new Set(['s2'])]]) }
    );
    expect(assignments.s1).toBe('a');
    expect(assignments.s2).toBe('a');
    expect(apartConflicts.length).toBe(1);
  });

  it('keeps a cohort together even when it splits a restricted pair', () => {
    // D13's precedence, ported: the lock wins and the conflict is reported.
    const stations = [makeStation('a', 0), makeStation('b', 1)];
    const { assignments, apartConflicts } = shuffleStudentsIntoStations(
      stations,
      ['s1', 's2', 's3', 's4'],
      Math.random,
      {
        keepTogether: [['s1', 's2']],
        keepApart: new Map([
          ['s1', new Set(['s2'])],
          ['s2', new Set(['s1'])],
        ]),
      }
    );
    expect(assignments.s1).toBe(assignments.s2);
    expect(apartConflicts.length).toBeGreaterThan(0);
  });

  it('splits a cohort no station can hold and says so', () => {
    const stations = [makeStation('a', 0, 2), makeStation('b', 1, 2)];
    const { assignments, splitCohorts, overflowStudents } =
      shuffleStudentsIntoStations(
        stations,
        ['s1', 's2', 's3', 's4'],
        Math.random,
        {
          keepTogether: [['s1', 's2', 's3']],
        }
      );
    expect(splitCohorts).toBe(1);
    // Splitting beats stranding them: every student still has a station.
    expect(overflowStudents).toEqual([]);
    expect(Object.values(assignments).filter((v) => v === null)).toEqual([]);
  });

  it('gives a student claimed by two cohorts to the first one', () => {
    // Two stations of exactly two seats. If the SECOND cohort won s2 the
    // units would be [s1], [s2,s3], [s4] and s2 would share a station with
    // s3; first-wins makes that impossible whichever order they are placed in.
    const stations = [makeStation('a', 0, 2), makeStation('b', 1, 2)];
    const { assignments } = shuffleStudentsIntoStations(
      stations,
      ['s1', 's2', 's3', 's4'],
      Math.random,
      {
        keepTogether: [
          ['s1', 's2'],
          ['s2', 's3'],
        ],
      }
    );
    expect(assignments.s1).toBe(assignments.s2);
    expect(assignments.s3).not.toBe(assignments.s2);
  });

  it('ignores cohort members who are not in the roster', () => {
    // Absent, or filtered out by the pool — either way they are not seated.
    const stations = [makeStation('a', 0), makeStation('b', 1)];
    const { assignments } = shuffleStudentsIntoStations(
      stations,
      ['s1', 's2'],
      Math.random,
      { keepTogether: [['s1', 'gone', 's2']] }
    );
    expect(assignments.gone).toBeUndefined();
    expect(assignments.s1).toBe(assignments.s2);
  });
});
