import { describe, expect, it } from 'vitest';
import {
  EMPTY_ASSIGN_CLASSES_VALUE,
  formatClassesValue,
  withClassIds,
  withClassStudents,
} from './assignClassesValue';

const rosters = [
  { id: 'c1', name: 'Sample 1' },
  { id: 'c2', name: 'Sample 2' },
  { id: 'c3', name: 'Sample 3' },
];
const ref = (id: string) => ({ kind: 'classlink' as const, sourcedId: id });

describe('formatClassesValue', () => {
  it('reads link only with nothing picked', () => {
    expect(formatClassesValue(EMPTY_ASSIGN_CLASSES_VALUE, rosters)).toBe(
      'No classes (link only)'
    );
  });

  it('counts every class when all are picked', () => {
    expect(
      formatClassesValue(
        { classIds: ['c1', 'c2', 'c3'], studentsByClass: {} },
        rosters
      )
    ).toBe('All 3 classes');
  });

  it('names picked classes in roster order', () => {
    expect(
      formatClassesValue(
        { classIds: ['c3', 'c1'], studentsByClass: {} },
        rosters
      )
    ).toBe('Sample 1, Sample 3');
  });

  it('adds the student count for narrowed classes', () => {
    expect(
      formatClassesValue(
        {
          classIds: ['c2', 'c3'],
          studentsByClass: { c2: [ref('a'), ref('b'), ref('c')] },
        },
        rosters
      )
    ).toBe('Sample 2 (3 students), Sample 3');
    expect(
      formatClassesValue(
        { classIds: ['c1', 'c2', 'c3'], studentsByClass: { c1: [ref('a')] } },
        rosters
      )
    ).toBe('Sample 1 (1 student), Sample 2, Sample 3');
  });

  it('ignores ids that are no longer rosters', () => {
    expect(
      formatClassesValue({ classIds: ['gone'], studentsByClass: {} }, rosters)
    ).toBe('No classes (link only)');
  });
});

describe('value helpers', () => {
  it('drops student picks for unpicked classes', () => {
    const v = withClassIds(
      {
        classIds: ['c1', 'c2'],
        studentsByClass: { c1: [ref('a')], c2: [ref('b')] },
      },
      ['c2']
    );
    expect(v).toEqual({
      classIds: ['c2'],
      studentsByClass: { c2: [ref('b')] },
    });
  });

  it('treats an empty pick as all students', () => {
    const v = withClassStudents(
      { classIds: ['c1'], studentsByClass: { c1: [ref('a')] } },
      'c1',
      []
    );
    expect(v.studentsByClass).toEqual({});
  });
});
