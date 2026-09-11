import { describe, it, expect } from 'vitest';
import {
  chunk,
  diffCatalog,
  parseStandardHeading,
  standardTagId,
  toBenchmarkDoc,
} from './standardsCatalog';
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
      standardCode: 'W2',
      standardTitle: 'Anchor',
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

describe('parseStandardHeading', () => {
  it('splits ELA headings into code and title', () => {
    expect(
      parseStandardHeading(
        'R9 Media Literacy in Reading: Read critically to comprehend media.',
        '6.1.9.1'
      )
    ).toEqual({ code: 'R9', title: 'Media Literacy in Reading' });
    expect(
      parseStandardHeading('LSVEI 1 Exchange ideas in discussion.', '6.3.1.1')
    ).toEqual({ code: 'LSVEI 1', title: 'Exchange ideas in discussion' });
  });

  it('splits Social Studies headings on the leading number', () => {
    expect(
      parseStandardHeading(
        '5. Public Policy: Explain how public policy is made.',
        '9.1.5.1'
      )
    ).toEqual({ code: '5', title: 'Public Policy' });
  });

  it('falls back to the numeric key from the benchmark code', () => {
    expect(parseStandardHeading('Anchor text only', '3.2.4.1')).toEqual({
      code: '2.4',
      title: 'Anchor text only',
    });
  });

  it('keeps only the first clause of a sentence-style heading', () => {
    expect(
      parseStandardHeading(
        'R4 Read critically to comprehend, interpret and analyze themes.',
        '6.1.4.1'
      )
    ).toEqual({ code: 'R4', title: 'Read critically to comprehend' });
    expect(
      parseStandardHeading(
        'W4 Write arguments to support claims and to persuade in an analysis of topics or texts using valid reasoning and evidence while considering audience.',
        '6.2.4.1'
      ).title
    ).toBe(
      'Write arguments to support claims and to persuade in an analysis of…'
    );
  });

  it('builds standard tag ids', () => {
    expect(standardTagId('mn-ela-2020', 'R9')).toBe('mn-ela-2020:std:R9');
  });
});
