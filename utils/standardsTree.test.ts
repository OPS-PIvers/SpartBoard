import { describe, expect, it } from 'vitest';
import type { StandardBenchmark } from '@/types';
import { buildStandardsTree, filterStandardsTree } from './standardsTree';

const bench = (
  code: string,
  grade: string,
  strand: string,
  standard: string,
  text: string,
  subject: 'ela' | 'social-studies' = 'ela'
): StandardBenchmark => ({
  id: `${subject === 'ela' ? 'mn-ela' : 'mn-ss'}:${code}`,
  set: subject === 'ela' ? 'mn-ela' : 'mn-ss',
  subject,
  code,
  grade,
  strand,
  standard,
  text,
  searchText: `${code} ${text}`.toLowerCase(),
});

const catalog: StandardBenchmark[] = [
  bench(
    '6.1.9.1',
    '6',
    'Reading',
    'R9 Media Literacy: Read media.',
    'Analyze ads'
  ),
  bench(
    '9.1.9.1',
    '9-12',
    'Reading',
    'R9 Media Literacy: Read media.',
    'Evaluate sources'
  ),
  bench('6.1.1.1', '6', 'Reading', 'R1 Foundations: Decode.', 'Decode words'),
  bench('6.2.1.1', '6', 'Writing', 'W1 Argument: Write.', 'Write claims'),
  bench(
    '7.1.5.1',
    '7',
    '1. Citizenship',
    '5. Public Policy: Explain.',
    'Explain policy',
    'social-studies'
  ),
];

describe('buildStandardsTree', () => {
  it('groups subject → strand → standard and orders by code', () => {
    const tree = buildStandardsTree(catalog);
    expect(tree.subjects.map((s) => s.subject)).toEqual([
      'ela',
      'social-studies',
    ]);
    const ela = tree.subjects[0];
    expect(ela.strands.map((s) => s.name)).toEqual(['Reading', 'Writing']);
    const reading = ela.strands[0];
    expect(reading.standards.map((s) => `${s.code} ${s.title}`)).toEqual([
      'R1 Foundations',
      'R9 Media Literacy',
    ]);
    expect(reading.standards[1].benchmarks.map((b) => b.code)).toEqual([
      '6.1.9.1',
      '9.1.9.1',
    ]);
    expect(reading.standards[1].key).toBe('mn-ela|R9');
    const ss = tree.subjects[1].strands[0].standards[0];
    expect(ss.code).toBe('5');
    expect(ss.title).toBe('Public Policy');
  });
});

describe('filterStandardsTree', () => {
  const tree = buildStandardsTree(catalog);

  it('narrows by subject and grade, dropping empty branches', () => {
    const out = filterStandardsTree(tree, {
      subject: 'ela',
      grades: ['10'],
      query: '',
    });
    expect(out.subjects).toHaveLength(1);
    expect(out.subjects[0].strands.map((s) => s.name)).toEqual(['Reading']);
    expect(out.subjects[0].strands[0].standards.map((s) => s.code)).toEqual([
      'R9',
    ]);
    expect(
      out.subjects[0].strands[0].standards[0].benchmarks.map((b) => b.code)
    ).toEqual(['9.1.9.1']);
    expect(out.matchedStandards.size).toBe(0);
  });

  it('keeps every benchmark when the standard heading matches the search', () => {
    const out = filterStandardsTree(tree, {
      subject: null,
      grades: [],
      query: 'media',
    });
    const standards = out.subjects[0].strands[0].standards;
    expect(standards.map((s) => s.code)).toEqual(['R9']);
    expect(standards[0].benchmarks).toHaveLength(2);
    expect([...out.matchedStandards]).toEqual(['mn-ela|R9']);
  });

  it('keeps only matching benchmarks when the search hits benchmark text', () => {
    const out = filterStandardsTree(tree, {
      subject: null,
      grades: [],
      query: 'evaluate',
    });
    expect(out.subjects).toHaveLength(1);
    const standards = out.subjects[0].strands[0].standards;
    expect(standards[0].benchmarks.map((b) => b.code)).toEqual(['9.1.9.1']);
  });

  it('returns an empty tree when nothing matches', () => {
    expect(
      filterStandardsTree(tree, { subject: 'ela', grades: ['3'], query: '' })
        .subjects
    ).toEqual([]);
  });
});
