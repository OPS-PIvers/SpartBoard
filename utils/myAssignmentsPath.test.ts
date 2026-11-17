import { describe, expect, it } from 'vitest';
import {
  isCourseLinkPath,
  myAssignmentsPath,
  parseMyAssignmentsPath,
  pickCourseLinkClass,
} from './myAssignmentsPath';

describe('my-assignments paths', () => {
  it('round-trips a class and its Grades tab', () => {
    const path = myAssignmentsPath('class 1/a', 'grades');
    expect(path).toBe('/my-assignments/class%201%2Fa/grades');
    expect(parseMyAssignmentsPath(path)).toEqual({
      classId: 'class 1/a',
      tab: 'grades',
      courseLinkId: null,
    });
  });

  it('falls back to the overview and the Assignments tab', () => {
    expect(parseMyAssignmentsPath('/my-assignments')).toEqual({
      classId: null,
      tab: 'assignments',
      courseLinkId: null,
    });
    expect(myAssignmentsPath(null, 'grades')).toBe('/my-assignments');
    expect(parseMyAssignmentsPath('/my-assignments/c1/other').tab).toBe(
      'assignments'
    );
    expect(parseMyAssignmentsPath('/my-assignments/%E0').classId).toBeNull();
  });

  it('reads a Course link as a link, never as a class id', () => {
    expect(parseMyAssignmentsPath('/my-assignments/course/Ab_9-x')).toEqual({
      classId: null,
      tab: 'assignments',
      courseLinkId: 'Ab_9-x',
    });
    expect(parseMyAssignmentsPath('/my-assignments/course')).toEqual({
      classId: null,
      tab: 'assignments',
      courseLinkId: null,
    });
    expect(
      parseMyAssignmentsPath('/my-assignments/course/a%2Fb').courseLinkId
    ).toBeNull();
  });

  it('knows a Course link path exactly', () => {
    expect(isCourseLinkPath('/my-assignments/course/Ab_9-x')).toBe(true);
    expect(isCourseLinkPath('/my-assignments/course/Ab/grades')).toBe(false);
    expect(isCourseLinkPath('/my-assignments/course/')).toBe(false);
    expect(isCourseLinkPath('/my-assignments/c1')).toBe(false);
    expect(isCourseLinkPath('/my-assignments/course/a.b')).toBe(false);
  });

  it("opens the link's class the student is in", () => {
    expect(pickCourseLinkClass(['c1', 'c2', 'c3'], ['c9', 'c2', 'c3'])).toBe(
      'c2'
    );
    expect(pickCourseLinkClass(['c1', 5, null], ['c9'])).toBeNull();
    expect(pickCourseLinkClass([], ['c1'])).toBeNull();
  });
});
