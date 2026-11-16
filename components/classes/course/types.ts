// Props shared by the My Classes Course pieces (docs/plans/COURSE_AND_AGENDA.md §4.2).
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

export interface CourseSectionProps {
  rosters: readonly CourseRoster[];
  courses: UseCoursesResult['courses'];
  saveCourse: UseCoursesResult['saveCourse'];
}

/** One Course, or a class in no Course yet (`group.course` null). */
export interface CourseGroupProps {
  group: CourseGroup<CourseRoster>;
  saveCourse: UseCoursesResult['saveCourse'];
}
