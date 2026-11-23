import { describe, it, expect } from 'vitest';
import {
  FORMER_MEMBER_WINDOW_MS,
  MAX_FORMER_MEMBERS,
  formerMemberIds,
  nextMembers,
} from './classlinkClassMembers';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe('nextMembers', () => {
  it('stamps new ids and ids not seen for a day', () => {
    expect(
      nextMembers({ a: NOW - 2 * DAY, b: NOW - 1000 }, ['a', 'b', 'c'], NOW)
    ).toEqual({ a: NOW, c: NOW });
  });

  it('skips the write when everyone was seen today', () => {
    expect(nextMembers({ a: NOW - 1000 }, ['a'], NOW)).toBeNull();
  });
});

describe('formerMemberIds', () => {
  it('returns stored students who are no longer enrolled, newest first', () => {
    expect(
      formerMemberIds(
        { stay: NOW, left1: NOW - 3 * DAY, left2: NOW - DAY },
        new Set(['stay']),
        NOW
      )
    ).toEqual(['left2', 'left1']);
  });

  it('drops students last seen outside the window', () => {
    expect(
      formerMemberIds(
        { old: NOW - FORMER_MEMBER_WINDOW_MS - 1 },
        new Set(),
        NOW
      )
    ).toEqual([]);
  });

  it('caps how many former students are looked up', () => {
    const stored: Record<string, number> = {};
    for (let i = 0; i < MAX_FORMER_MEMBERS + 10; i++) stored[`s${i}`] = NOW - i;
    expect(formerMemberIds(stored, new Set(), NOW)).toHaveLength(
      MAX_FORMER_MEMBERS
    );
  });
});
