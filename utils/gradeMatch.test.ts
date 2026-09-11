import { describe, expect, it } from 'vitest';
import {
  bandsFromGrades,
  expandGrade,
  gradeOverlaps,
  gradesFromBands,
  normalizeGrades,
} from './gradeMatch';

describe('gradeMatch', () => {
  it('expands single grades and bands', () => {
    expect(expandGrade('K')).toEqual(['K']);
    expect(expandGrade('7')).toEqual(['7']);
    expect(expandGrade('9-12')).toEqual(['9', '10', '11', '12']);
    expect(expandGrade('11-12')).toEqual(['11', '12']);
    expect(expandGrade('K-2')).toEqual(['K', '1', '2']);
    expect(expandGrade('PK')).toEqual([]);
    expect(expandGrade('12-9')).toEqual([]);
  });

  it('matches by overlap and treats no grades as everything', () => {
    expect(gradeOverlaps('9-12', ['10'])).toBe(true);
    expect(gradeOverlaps('11-12', ['10'])).toBe(false);
    expect(gradeOverlaps('K', ['K', '1'])).toBe(true);
    expect(gradeOverlaps('3', ['4'])).toBe(false);
    expect(gradeOverlaps('3', [])).toBe(true);
  });

  it('round-trips bands and grades', () => {
    expect(gradesFromBands(['9-12'])).toEqual(['9', '10', '11', '12']);
    expect(gradesFromBands(['3-5', 'k-2'])).toEqual([
      'K',
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(bandsFromGrades(['10', '12'])).toEqual(['9-12']);
    expect(bandsFromGrades(['2', '3'])).toEqual(['k-2', '3-5']);
    expect(bandsFromGrades([])).toEqual([]);
  });

  it('normalizes stored grade values', () => {
    expect(normalizeGrades(['k', ' 10 ', '0', '10', 'x', 3, '13'])).toEqual([
      'K',
      '10',
    ]);
    expect(normalizeGrades(['12', '1', 'K'])).toEqual(['K', '1', '12']);
  });
});
