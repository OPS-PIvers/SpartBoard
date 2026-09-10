import { describe, it, expect } from 'vitest';
import { chunk, diffCatalog, toBenchmarkDoc } from './standardsCatalog';
import type { StandardBenchmark } from '@/types';

const row = {
  id: 'mn-ela-2020:6.4.2.2',
  set: 'mn-ela-2020',
  subject: 'ela' as const,
  code: '6.4.2.2',
  grade: '6',
  strand: 'Writing',
  standard: 'W2 Anchor',
  text: 'Write Informative Texts',
};

describe('toBenchmarkDoc', () => {
  it('copies fields and derives lowercased searchText from code + text', () => {
    expect(toBenchmarkDoc(row)).toEqual({
      ...row,
      searchText: '6.4.2.2 write informative texts',
    });
  });
});

describe('diffCatalog', () => {
  const base = toBenchmarkDoc(row);
  const other = toBenchmarkDoc({
    ...row,
    id: 'mn-ela-2020:6.4.2.3',
    code: '6.4.2.3',
  });

  it('reports everything as added when the catalog is empty', () => {
    const diff = diffCatalog(new Map(), [base, other]);
    expect(diff).toEqual({
      added: [base, other],
      updated: [],
      unchangedCount: 0,
    });
  });

  it('counts identical docs as unchanged', () => {
    const existing = new Map<string, StandardBenchmark>([
      [base.id, { ...base }],
    ]);
    expect(diffCatalog(existing, [base])).toEqual({
      added: [],
      updated: [],
      unchangedCount: 1,
    });
  });

  it('reports a doc as updated when any field differs', () => {
    const existing = new Map([[base.id, { ...base, strand: 'Reading' }]]);
    const diff = diffCatalog(existing, [base, other]);
    expect(diff).toEqual({
      added: [other],
      updated: [base],
      unchangedCount: 0,
    });
  });

  it('ignores docs that exist only in Firestore', () => {
    const existing = new Map([[other.id, other]]);
    expect(diffCatalog(existing, [base])).toEqual({
      added: [base],
      updated: [],
      unchangedCount: 0,
    });
  });
});

describe('chunk', () => {
  it('splits into fixed-size slices with a short tail', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
