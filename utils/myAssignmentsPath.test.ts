import { describe, expect, it } from 'vitest';
import { myAssignmentsPath, parseMyAssignmentsPath } from './myAssignmentsPath';

describe('my-assignments paths', () => {
  it('round-trips a class and its Grades tab', () => {
    const path = myAssignmentsPath('class 1/a', 'grades');
    expect(path).toBe('/my-assignments/class%201%2Fa/grades');
    expect(parseMyAssignmentsPath(path)).toEqual({
      classId: 'class 1/a',
      tab: 'grades',
    });
  });

  it('falls back to the overview and the Assignments tab', () => {
    expect(parseMyAssignmentsPath('/my-assignments')).toEqual({
      classId: null,
      tab: 'assignments',
    });
    expect(myAssignmentsPath(null, 'grades')).toBe('/my-assignments');
    expect(parseMyAssignmentsPath('/my-assignments/c1/other').tab).toBe(
      'assignments'
    );
    expect(parseMyAssignmentsPath('/my-assignments/%E0').classId).toBeNull();
  });
});
