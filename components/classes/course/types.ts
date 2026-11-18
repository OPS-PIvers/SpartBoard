// Props shared by the My Classes Course pieces (docs/plans/COURSE_AND_AGENDA.md §4.2).
import type React from 'react';
import type { ClassRoster } from '@/types';
import type { CourseGroup } from '@/utils/course/courseGroups';
import type { UseCoursesResult } from '@/hooks/useCourses';

export type CourseRoster = Pick<
  ClassRoster,
  | 'id'
  | 'name'
  | 'classlinkClassId'
  | 'testClassId'
  | 'classlinkSubject'
  | 'classlinkClassCode'
>;

export interface CourseClassListProps<R extends CourseRoster> {
  rosters: readonly R[];
  courses: UseCoursesResult['courses'];
  saveCourse: UseCoursesResult['saveCourse'];
  /** Renders one class row (an `li`); `index` is its place in the full roster list. */
  renderRow: (roster: R, index: number, inCourse: boolean) => React.ReactNode;
  /** The actions menu on a linked Course row. */
  renderCourseMenu?: (
    sections: readonly R[],
    rowKey: string,
    courseName: string
  ) => React.ReactNode;
  /** Extra attributes for the outer list, such as its tour anchor. */
  listAttrs?: Record<string, string>;
}

/** One Course, or a class in no Course yet (`group.course` null). */
export interface CourseGroupProps {
  group: CourseGroup<CourseRoster>;
  saveCourse: UseCoursesResult['saveCourse'];
}
