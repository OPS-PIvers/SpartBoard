import { describe, it, expect } from 'vitest';
import {
  findPoolGroupByTitle,
  normalizePoolTitle,
  rankPoolCandidates,
  resolvePlcPoolSyncGroupId,
} from './plcPooling';

const LIBRARY = [
  { title: 'Unit 4 CFA', syncGroupId: 'g-unit4' },
  { title: 'Fractions  Quick Check', syncGroupId: 'g-fractions' },
  { title: 'Deleted Quiz', syncGroupId: 'g-deleted', deletedAt: 5 },
];

describe('normalizePoolTitle', () => {
  it('lowercases, collapses whitespace and trims', () => {
    expect(normalizePoolTitle('  Unit   4\tCFA ')).toBe('unit 4 cfa');
  });
});

describe('findPoolGroupByTitle', () => {
  it('matches on the normalized title', () => {
    expect(
      findPoolGroupByTitle(LIBRARY, 'fractions quick check')?.syncGroupId
    ).toBe('g-fractions');
  });

  it('skips soft-deleted entries', () => {
    expect(findPoolGroupByTitle(LIBRARY, 'Deleted Quiz')).toBeUndefined();
  });

  it('ignores an empty title', () => {
    expect(findPoolGroupByTitle(LIBRARY, '   ')).toBeUndefined();
  });
});

describe('resolvePlcPoolSyncGroupId', () => {
  it('keeps the quiz group when it is already in the library', () => {
    expect(
      resolvePlcPoolSyncGroupId({
        quizSyncGroupId: 'g-unit4',
        quizTitle: 'Something else',
        libraryEntries: LIBRARY,
      })
    ).toBe('g-unit4');
  });

  it('falls back to the title match when the quiz group is not in the library', () => {
    expect(
      resolvePlcPoolSyncGroupId({
        quizSyncGroupId: 'g-private-copy',
        quizTitle: 'UNIT 4 CFA',
        libraryEntries: LIBRARY,
      })
    ).toBe('g-unit4');
  });

  it('returns undefined when nothing matches', () => {
    expect(
      resolvePlcPoolSyncGroupId({
        quizTitle: 'Brand new quiz',
        libraryEntries: LIBRARY,
      })
    ).toBeUndefined();
  });

  it('does not treat a deleted library group as a match', () => {
    expect(
      resolvePlcPoolSyncGroupId({
        quizSyncGroupId: 'g-deleted',
        quizTitle: 'nope',
        libraryEntries: LIBRARY,
      })
    ).toBeUndefined();
  });
});

describe('rankPoolCandidates', () => {
  const assessments = [
    { syncGroupId: 'a', title: 'Other', sourceQuizId: 'q-other' },
    { syncGroupId: 'b', title: 'Unit 4 CFA' },
    { syncGroupId: 'c', title: 'Another', sourceQuizId: 'q-1' },
    { syncGroupId: 'd', title: 'unit 4 cfa' },
  ];

  it('orders source-quiz match, then title matches, then the rest (stable)', () => {
    const ranked = rankPoolCandidates(assessments, {
      quizId: 'q-1',
      title: 'Unit 4 CFA',
    });
    expect(ranked.map((a) => a.syncGroupId)).toEqual(['c', 'b', 'd', 'a']);
  });
});
