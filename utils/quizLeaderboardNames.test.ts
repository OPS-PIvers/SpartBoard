import { describe, expect, it } from 'vitest';
import {
  readLeaderboardNames,
  splitLeaderboardNames,
  withLeaderboardNames,
} from './quizLeaderboardNames';

describe('splitLeaderboardNames', () => {
  it('moves names off the rows into a map keyed by studentUid', () => {
    const out = splitLeaderboardNames([
      { studentUid: 'a', name: 'Ada L.', score: 9, rank: 1 },
      { studentUid: 'b', score: 8, rank: 2 },
      { name: 'No uid', score: 1, rank: 3 },
    ]);
    expect(out.entries).toEqual([
      { studentUid: 'a', score: 9, rank: 1 },
      { studentUid: 'b', score: 8, rank: 2 },
      { score: 1, rank: 3 },
    ]);
    expect(out.names).toEqual({ a: 'Ada L.' });
  });
});

describe('readLeaderboardNames', () => {
  it('keeps only non-empty string names', () => {
    expect(
      readLeaderboardNames({ names: { a: 'Ada', b: 3, c: '', d: null } })
    ).toEqual({ a: 'Ada' });
    expect(readLeaderboardNames(undefined)).toEqual({});
    expect(readLeaderboardNames({ names: 'x' })).toEqual({});
  });
});

describe('withLeaderboardNames', () => {
  const rows = [
    { studentUid: 'a', score: 9, rank: 1 },
    { studentUid: 'b', name: 'Old Name', score: 8, rank: 2 },
    { studentUid: 'c', score: 7, rank: 3 },
  ];
  it('puts names back by studentUid and keeps names already on a row', () => {
    expect(withLeaderboardNames(rows, { a: 'Ada', b: 'New' })).toEqual([
      { studentUid: 'a', name: 'Ada', score: 9, rank: 1 },
      { studentUid: 'b', name: 'Old Name', score: 8, rank: 2 },
      { studentUid: 'c', score: 7, rank: 3 },
    ]);
  });
  it('returns the rows unchanged without names', () => {
    expect(withLeaderboardNames(rows, null)).toBe(rows);
  });
});
