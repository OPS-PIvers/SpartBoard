import { describe, it, expect, vi } from 'vitest';
import { StandardBenchmark } from '@/types';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: true }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
}));

import { filterBenchmarks } from './useStandardsCatalog';

const mk = (
  code: string,
  text: string,
  grade = '6',
  set = 'mn'
): StandardBenchmark => ({
  id: `${set}:${code}`,
  set,
  subject: 'ela',
  code,
  grade,
  strand: 'Reading',
  standard: 'Anchor',
  text,
  searchText: `${code} ${text}`.toLowerCase(),
});

const catalog = [
  mk('6.1.1.1', 'Cite textual evidence'),
  mk('7.1.1.1', 'Cite several pieces of evidence', '7'),
  mk('6.2.1.1', 'Determine a theme', '6', 'other'),
];

describe('filterBenchmarks', () => {
  it('matches every term against searchText, case-insensitively', () => {
    expect(
      filterBenchmarks(catalog, { query: 'CITE evidence' }).map((b) => b.code)
    ).toEqual(['6.1.1.1', '7.1.1.1']);
    expect(
      filterBenchmarks(catalog, { query: '6.2' }).map((b) => b.code)
    ).toEqual(['6.2.1.1']);
  });

  it('returns everything for a blank query and applies grade/set filters', () => {
    expect(filterBenchmarks(catalog, { query: '  ' })).toHaveLength(3);
    expect(
      filterBenchmarks(catalog, { query: '', grade: '7' }).map((b) => b.code)
    ).toEqual(['7.1.1.1']);
    expect(filterBenchmarks(catalog, { query: 'theme', set: 'mn' })).toEqual(
      []
    );
  });
});
