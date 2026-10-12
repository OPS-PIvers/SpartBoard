import { describe, expect, it } from 'vitest';
import type { StandardBenchmark } from '@/types';
import {
  findStandardRuns,
  indexByCode,
  takeStandardsFromText,
} from './standardsInText';

const b = (
  set: string,
  code: string,
  subject: StandardBenchmark['subject'],
  grade = code.split('.')[0]
): StandardBenchmark => ({
  id: `${set}:${code}`,
  set,
  subject,
  code,
  grade,
  strand: '',
  standard: '',
  text: `${set} ${code}`,
  searchText: '',
});

const catalog = indexByCode([
  b('mn-ela-2020', '7.4.1.1', 'ela'),
  b('mn-ela-2020', '6.1.2.1', 'ela'),
  b('mn-ss-2021', '6.1.2.1', 'social-studies'),
  b('mn-math-2007', '5.1.1.1', 'math'),
  b('mn-math-2022', '5.1.1.1', 'math'),
  b('mn-sci-2019', '7L.3.1.1.1', 'science', '7'),
]);

const codesOf = (text: string) =>
  findStandardRuns(text).flatMap((r) => r.codes);

describe('findStandardRuns', () => {
  it.each([
    ['(MN 7.4.1.1) What does the author mean?', ['7.4.1.1']],
    ['7.4.1.1 What does the author mean?', ['7.4.1.1']],
    ['7.4.1.1. What does the author mean?', ['7.4.1.1']],
    ['What does the author mean? 7.4.1.1', ['7.4.1.1']],
    [
      'What does the author mean? [Standard: 7.4.1.1, 6.1.2.1]',
      ['7.4.1.1', '6.1.2.1'],
    ],
    ['Standards: 7L.3.1.1.1 Which cell part makes energy?', ['7L.3.1.1.1']],
    ['Benchmark 5.1.1.1 and 5.1.1.2: add the numbers.', ['5.1.1.1', '5.1.1.2']],
  ])('finds codes in %s', (text, codes) => {
    expect(codesOf(text)).toEqual(codes);
  });

  it.each([
    'What is 3.14 rounded to a whole number?',
    'Version 1.2.3.4 of the app was released in which year?',
    'Is 7.4.1.1 the right answer here or not?',
  ])('leaves %s alone', (text) => {
    expect(codesOf(text)).toEqual([]);
  });
});

describe('takeStandardsFromText', () => {
  it('cuts a resolved code and tidies the text', () => {
    const out = takeStandardsFromText(
      'What does the author mean? (MN 7.4.1.1)',
      catalog
    );
    expect(out.text).toBe('What does the author mean?');
    expect(out.matched.map((m) => m.id)).toEqual(['mn-ela-2020:7.4.1.1']);
  });

  it('keeps a code two sets share unless the profile settles it', () => {
    const text = '6.1.2.1 Why did the colonists protest?';
    expect(takeStandardsFromText(text, catalog).matched).toEqual([]);
    expect(takeStandardsFromText(text, catalog).text).toBe(text);
    const out = takeStandardsFromText(text, catalog, {
      subjects: ['social-studies'],
      grades: [],
    });
    expect(out.matched.map((m) => m.id)).toEqual(['mn-ss-2021:6.1.2.1']);
    expect(out.text).toBe('Why did the colonists protest?');
  });

  it('prefers the newest set within one subject', () => {
    const out = takeStandardsFromText('Add the numbers. 5.1.1.1', catalog, {
      subjects: [],
      grades: [],
    });
    expect(out.matched.map((m) => m.id)).toEqual(['mn-math-2022:5.1.1.1']);
  });

  it('leaves a run alone when any code in it is unknown', () => {
    const text = 'Which is true? (7.4.1.1, 9.9.9.9)';
    expect(takeStandardsFromText(text, catalog)).toEqual({ text, matched: [] });
  });
});
