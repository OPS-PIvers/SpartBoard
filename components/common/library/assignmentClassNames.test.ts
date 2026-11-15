import { describe, expect, it } from 'vitest';
import {
  assignmentClassNamesTitle,
  formatAssignmentClassNames,
  splitAssignmentClassNames,
} from './assignmentClassNames';

describe('formatAssignmentClassNames', () => {
  it('returns null with no classes', () => {
    expect(formatAssignmentClassNames([])).toBeNull();
    expect(formatAssignmentClassNames(['', '  ', undefined])).toBeNull();
  });

  it('shows one class in full', () => {
    expect(formatAssignmentClassNames(['Sample - Mock Period 1'])).toBe(
      'Sample - Mock Period 1'
    );
  });

  it('writes a shared SIS prefix once', () => {
    expect(
      formatAssignmentClassNames([
        'Sample - Mock Period 1',
        'Sample - Mock Period 2',
        'Sample - Mock Period 10',
      ])
    ).toBe('Sample - Mock Period 1, 2, 10');
  });

  it('writes a shared suffix once', () => {
    expect(
      formatAssignmentClassNames([
        'Science 8 - P1 - Ivers (S1)',
        'Science 8 - P3 - Ivers (S1)',
      ])
    ).toBe('Science 8 - P1, P3 - Ivers (S1)');
  });

  it('cuts only at word boundaries', () => {
    expect(formatAssignmentClassNames(['Math 7A', 'Math 7B'])).toBe(
      'Math 7A, 7B'
    );
  });

  it('joins unrelated names in full', () => {
    expect(formatAssignmentClassNames(['Biology', 'Chemistry Honors'])).toBe(
      'Biology, Chemistry Honors'
    );
  });

  it('keeps a name that is a prefix of another whole', () => {
    expect(formatAssignmentClassNames(['Math 7', 'Math 7 Honors'])).toBe(
      'Math 7, Math 7 Honors'
    );
  });

  it('never compresses a shared tail alone', () => {
    expect(formatAssignmentClassNames(['Algebra 1', 'Geometry 1'])).toBe(
      'Algebra 1, Geometry 1'
    );
    expect(formatAssignmentClassNames(['Science - P1', 'Science / P1'])).toBe(
      'Science - P1, Science / P1'
    );
  });

  it('drops duplicates and extra spaces', () => {
    expect(formatAssignmentClassNames(['Period 3', 'period 3'])).toBe(
      'Period 3'
    );
    expect(formatAssignmentClassNames(['Period  3', 'Period 3'])).toBe(
      'Period 3'
    );
    expect(assignmentClassNamesTitle(['A', 'B', 'A'])).toBe('A\nB');
  });
});

describe('splitAssignmentClassNames', () => {
  it('splits classes that share only a tail', () => {
    expect(splitAssignmentClassNames(['Art 1', 'Music 1', 'PE 1'])).toEqual({
      first: 'Art 1',
      more: 2,
      total: 3,
    });
  });

  it('splits three or more unrelated classes', () => {
    expect(
      splitAssignmentClassNames(['Biology', 'Chemistry', 'Physics'])
    ).toEqual({ first: 'Biology', more: 2, total: 3 });
  });

  it('leaves short or shared-prefix lists whole', () => {
    expect(splitAssignmentClassNames(['Biology', 'Chemistry'])).toBeNull();
    expect(
      splitAssignmentClassNames(['Period 1', 'Period 2', 'Period 3'])
    ).toBeNull();
  });
});
