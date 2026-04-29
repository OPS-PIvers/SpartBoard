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
