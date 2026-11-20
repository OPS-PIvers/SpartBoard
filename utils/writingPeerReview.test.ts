import { describe, expect, it } from 'vitest';
import {
  normalizeGroups,
  pairAtRandom,
  pairWith,
  peerEdges,
  peerLinksFor,
  peerStudentList,
  unpair,
} from './writingPeerReview';

const seq = () => {
  let s = 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

describe('writing peer review groups', () => {
  it('pairs read each other and three go in a round', () => {
    expect(peerEdges([['a', 'b']])).toEqual([
      { reviewerUid: 'a', authorUid: 'b' },
      { reviewerUid: 'b', authorUid: 'a' },
    ]);
    expect(peerEdges([['a', 'b', 'c'], ['d']])).toEqual([
      { reviewerUid: 'a', authorUid: 'b' },
      { reviewerUid: 'b', authorUid: 'c' },
      { reviewerUid: 'c', authorUid: 'a' },
    ]);
  });

  it('drops singles, repeats and anything past three', () => {
    expect(
      normalizeGroups([['a', 'b', 'c', 'd'], ['a', 'e'], ['f'], ['', 'g']])
    ).toEqual([['a', 'b', 'c']]);
  });

  it('pairs everyone, and the odd one out makes a three', () => {
    const groups = pairAtRandom(['a', 'b', 'c', 'd', 'e'], [], seq());
    expect(groups.map((g) => g.length).sort()).toEqual([2, 3]);
    expect(groups.flat().sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps chosen pairs and pairs only the rest', () => {
    const groups = pairAtRandom(['a', 'b', 'c', 'd'], [['a', 'b']], seq());
    expect(groups[0]).toEqual(['a', 'b']);
    expect(groups[1].sort()).toEqual(['c', 'd']);
  });

  it('puts one leftover student into a kept pair', () => {
    expect(pairAtRandom(['a', 'b', 'c'], [['a', 'b']], seq())).toEqual([
      ['a', 'b', 'c'],
    ]);
  });

  it('pairWith joins a pair with room and starts a new pair otherwise', () => {
    expect(pairWith([['a', 'b']], 'c', 'a')).toEqual([['a', 'b', 'c']]);
    expect(pairWith([['a', 'b', 'c']], 'd', 'a')).toEqual([
      ['b', 'c'],
      ['d', 'a'],
    ]);
    expect(
      pairWith(
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
        'a',
        'c'
      )
    ).toEqual([['c', 'd', 'a']]);
  });

  it('unpair drops a pair left with one student', () => {
    expect(
      unpair(
        [
          ['a', 'b'],
          ['c', 'd', 'e'],
        ],
        'a'
      )
    ).toEqual([['c', 'd', 'e']]);
    expect(unpair([['c', 'd', 'e']], 'd')).toEqual([['c', 'e']]);
  });

  it('peerLinksFor names who a student reads and who reads them', () => {
    expect(peerLinksFor([['a', 'b', 'c']], 'b')).toEqual({
      reviews: 'c',
      reviewedBy: 'a',
    });
    expect(peerLinksFor([], 'b')).toEqual({ reviews: null, reviewedBy: null });
  });

  it('lists students as Last, First sorted by last name', () => {
    const names = new Map([
      ['1', { givenName: 'Bo', familyName: 'Lee' }],
      ['2', { givenName: 'Ana', familyName: 'García' }],
      ['3', { givenName: 'Cher', familyName: '' }],
    ]);
    expect(peerStudentList(['1', '2', '3', '4', '1'], names)).toEqual([
      { uid: '3', name: 'Cher' },
      { uid: '2', name: 'García, Ana' },
      { uid: '1', name: 'Lee, Bo' },
    ]);
  });
});
