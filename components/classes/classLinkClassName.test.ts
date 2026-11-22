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
      period: '2',
    });
    expect(
      parseClassTitle('(S2) Ivers, J READING FOR HIGH SCHOOL SUCCESS(5)')
    ).toEqual({
      term: 'S2',
      course: 'Reading for High School Success',
      period: '5',
    });
  });

  it('falls back to OneRoster periods when the title has none', () => {
    expect(parseClassTitle('(S1) Ivers, J AP BIOLOGY', ['3'])).toMatchObject({
      course: 'AP Biology',
      period: '3',
    });
  });

  it('returns null for titles that are not SIS-shaped', () => {
    expect(parseClassTitle('Spanish II A(5)')).toBeNull();
    expect(parseClassTitle('Mock Period 1 (test)')).toBeNull();
    expect(parseClassTitle('(S1) ')).toBeNull();
  });
});

describe('tidyCourseCase', () => {
  it('title-cases all-caps names but keeps numerals and acronyms', () => {
    expect(tidyCourseCase('AP US HISTORY II')).toBe('AP US History II');
    expect(tidyCourseCase('BIOLOGY 1-2')).toBe('Biology 1-2');
  });

  it('leaves mixed-case names alone', () => {
    expect(tidyCourseCase('iPad Lab')).toBe('iPad Lab');
  });
});

describe('cleanClassLinkName', () => {
  const cls = { title: `${T}ENGLISH I A(2)` };
  it('formats each style', () => {
    expect(cleanClassLinkName(cls)).toBe('English I A (S1, P2)');
    expect(cleanClassLinkName(cls, 'course-period')).toBe(
      'English I A, Period 2'
    );
    expect(cleanClassLinkName(cls, 'period-course')).toBe('P2 English I A');
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
    expect(names.get('a')).toBe('English I A (S1, P2) (18119)');
    expect(names.get('b')).toBe('English I A (S1, P2) (18666)');
    expect(names.get('c')).toBe('English I A (S1, P3)');
    expect(names.has('test:x')).toBe(false);
    expect(names.has('d')).toBe(false);
  });
});
