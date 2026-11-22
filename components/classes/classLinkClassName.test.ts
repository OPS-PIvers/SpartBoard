import { describe, expect, it } from 'vitest';
import {
  buildCleanClassNames,
  cleanClassLinkName,
  parseClassTitle,
  tidyCourseCase,
} from './classLinkClassName';

const T = '(S1) Erickson, T /Frie/Ivers/Nohner ';

describe('parseClassTitle', () => {
  it('splits term, teachers, course and period', () => {
    expect(parseClassTitle(`${T}ENGLISH I A(2)`)).toEqual({
      term: 'S1',
      course: 'English I A',
      periods: ['2'],
    });
    expect(
      parseClassTitle('(S2) Ivers, J READING FOR HIGH SCHOOL SUCCESS(5)')
    ).toEqual({
      term: 'S2',
      course: 'Reading for High School Success',
      periods: ['5'],
    });
  });

  it('falls back to OneRoster periods when the title has none', () => {
    expect(parseClassTitle('(S1) Ivers, J AP BIOLOGY', ['3'])).toMatchObject({
      course: 'AP Biology',
      periods: ['3'],
    });
  });

  it('returns null for titles that are not SIS-shaped', () => {
    expect(parseClassTitle('Spanish II A(5)')).toBeNull();
    expect(parseClassTitle('Mock Period 1 (test)')).toBeNull();
    expect(parseClassTitle('(S1) ')).toBeNull();
    expect(parseClassTitle('(S1) CHOIR, A CAPPELLA(2)')).toBeNull();
    expect(parseClassTitle('(S1) Erickson, T')).toBeNull();
  });

  it('handles multi-word surnames, full first names and co-teachers with initials', () => {
    expect(parseClassTitle('(S1) De La Cruz, K ENGLISH I A(2)')?.course).toBe(
      'English I A'
    );
    expect(parseClassTitle('(S1) Erickson, Tom MATH 7(1)')?.course).toBe(
      'Math 7'
    );
    expect(parseClassTitle('(S1) Erickson, T /Frie, J MATH 7(1)')?.course).toBe(
      'Math 7'
    );
  });

  it('only reads a number in parentheses as a period', () => {
    expect(parseClassTitle('(S1) Erickson, T BIOLOGY (H)')).toMatchObject({
      course: 'Biology (H)',
      periods: [],
    });
  });
});

describe('tidyCourseCase', () => {
  it('title-cases all-caps names but keeps numerals and acronyms', () => {
    expect(tidyCourseCase('AP US HISTORY II')).toBe('AP US History II');
    expect(tidyCourseCase('BIOLOGY 1-2')).toBe('Biology 1-2');
    expect(tidyCourseCase('IB HL MATH')).toBe('IB HL Math');
    expect(tidyCourseCase('6TH GRADE SCIENCE')).toBe('6th Grade Science');
  });

  it('leaves mixed-case names alone', () => {
    expect(tidyCourseCase('iPad Lab')).toBe('iPad Lab');
  });
});

describe('cleanClassLinkName', () => {
  const cls = { title: `${T}ENGLISH I A(2)` };
  it('names the course with its period', () => {
    expect(cleanClassLinkName(cls)).toBe('English I A (P2)');
    expect(cleanClassLinkName({ title: 'Ivers, J ART(3)' })).toBe('Art (P3)');
  });

  it('lists every OneRoster period', () => {
    const multi = { title: '(S1) Ivers, J MATH 7', periods: ['1', '2'] };
    expect(cleanClassLinkName(multi)).toBe('Math 7 (P1, P2)');
  });
});

describe('buildCleanClassNames', () => {
  it('adds the class code when two classes clean to the same name', () => {
    const names = buildCleanClassNames([
      { sourcedId: 'a', title: `${T}ENGLISH I A(2)`, classCode: '18119' },
      {
        sourcedId: 'b',
        title: '(S1) Ivers, J ENGLISH I A(2)',
        classCode: '18666',
      },
      { sourcedId: 'c', title: `${T}ENGLISH I A(3)`, classCode: '18507' },
      { sourcedId: 'test:x', title: '(S1) Ivers, J TEST(1)' },
      { sourcedId: 'd', title: 'Homeroom' },
    ]);
    expect(names.get('a')).toBe('English I A (P2) (18119)');
    expect(names.get('b')).toBe('English I A (P2) (18666)');
    expect(names.get('c')).toBe('English I A (P3)');
    expect(names.has('test:x')).toBe(false);
    expect(names.has('d')).toBe(false);
  });

  it('keeps the full title when a repeat has no class code', () => {
    const names = buildCleanClassNames([
      { sourcedId: 'a', title: '(S1) Ivers, J MATH 7(1)' },
      { sourcedId: 'b', title: '(S1) Frie, K MATH 7(1)', classCode: '9' },
      { sourcedId: 'c', title: '(S1) Nohner, L MATH 7(1)' },
    ]);
    expect(names.has('a')).toBe(false);
    expect(names.get('b')).toBe('Math 7 (P1) (9)');
    expect(names.has('c')).toBe(false);
  });
});
