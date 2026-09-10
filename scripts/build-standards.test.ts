import { describe, expect, it } from 'vitest';
import {
  buildBenchmarks,
  cleanText,
  normalizeGrade,
  parseCsv,
} from './build-standards.mjs';

describe('build-standards', () => {
  it('parses quoted multi-line fields and ignores padding columns', () => {
    const rows = parseCsv(
      'Grade,Strand,Anchor Standard,Code,Benchmark,,,\n' +
        'K,Reading,R1 Foundations,0.1.1.0,"Line one,\na. ""quoted"" two",,,\n'
    );
    expect(rows[1].slice(0, 5)).toEqual([
      'K',
      'Reading',
      'R1 Foundations',
      '0.1.1.0',
      'Line one,\na. "quoted" two',
    ]);
  });

  it('normalizes typographic characters, whitespace and grades', () => {
    expect(cleanText('a.   It’s “fine” –  ok ')).toBe('a. It\'s "fine" - ok');
    expect(normalizeGrade(' k ')).toBe('K');
    expect(normalizeGrade('11–12')).toBe('11-12');
    expect(normalizeGrade('3')).toBe('3');
  });

  it('skips title rows, accepts the Standard header alias, remaps grades', () => {
    const rows = [
      [
        'Social Studies Standards and Benchmarks by Grade Level',
        '',
        '',
        '',
        '',
      ],
      ['Grade', 'Strand', 'Standard', 'Code', 'Benchmark'],
      [
        '9',
        '4. History',
        '15. Historical Thinking',
        '9.4.15.1',
        'Analyze — sources.',
      ],
    ];
    expect(
      buildBenchmarks(rows, 'mn-ss-2021', 'social-studies', { '9': '9-12' })
    ).toEqual([
      {
        id: 'mn-ss-2021:9.4.15.1',
        set: 'mn-ss-2021',
        subject: 'social-studies',
        code: '9.4.15.1',
        grade: '9-12',
        strand: '4. History',
        standard: '15. Historical Thinking',
        text: 'Analyze - sources.',
      },
    ]);
  });

  it('builds ids from set and code, drops trailer rows, rejects duplicates', () => {
    const rows = [
      ['Grade', 'Strand', 'Anchor Standard', 'Code', 'Benchmark'],
      ['2', 'Writing', 'W1 Text', '2.2.1.1', 'Write.'],
      ['end of worksheet', '', '', '', 'Feb 2024'],
    ];
    expect(buildBenchmarks(rows, 'mn-ela-2020', 'ela')).toEqual([
      {
        id: 'mn-ela-2020:2.2.1.1',
        set: 'mn-ela-2020',
        subject: 'ela',
        code: '2.2.1.1',
        grade: '2',
        strand: 'Writing',
        standard: 'W1 Text',
        text: 'Write.',
      },
    ]);
    expect(() =>
      buildBenchmarks([rows[0], rows[1], rows[1]], 'mn-ela-2020', 'ela')
    ).toThrow(/duplicate code/);
    expect(() => buildBenchmarks([['Grade']], 'x', 'ela')).toThrow(
      /missing columns/
    );
  });
});
