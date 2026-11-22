// The saveCourseV1 calls that turn a Course (or none) into a name over picked classes (D4, D5).
import type { ClassRoster } from '@/types';
import type { Course, SaveCourseRequest } from './contract';
import type { CourseGroup } from './courseGroups';

/** The requests that turn `course` (null for a new Course) into `name` over `selected`, in order. */
export function courseEditRequests(
  groups: readonly CourseGroup<Pick<ClassRoster, 'id'>>[],
  course: Course | null,
  name: string,
  selected: readonly string[]
): SaveCourseRequest[] {
  if (!course) {
    // A deleted class still listed on a Course doesn't stop it being the base.
    const existing = new Set(groups.flatMap((g) => g.rosters.map((r) => r.id)));
    // Build on a saved Course whose classes are all picked, so its Agenda and links carry over.
    const base = groups
      .map((g) => g.course)
      .filter(
        (c): c is Course =>
          c !== null &&
          c.rosterIds
            .filter((id) => existing.has(id))
            .every((id) => selected.includes(id))
      )
      .sort((a, b) => b.rosterIds.length - a.rosterIds.length)[0];
    return [
      {
        action: 'save',
        course: base
          ? {
              id: base.id,
              name,
              rosterIds: [...selected],
              expectedUpdatedAt: base.updatedAt,
            }
          : { name, rosterIds: [...selected] },
      },
    ];
  }
  const out: SaveCourseRequest[] = [];
  const added = selected.filter((id) => !course.rosterIds.includes(id));
  const removed = course.rosterIds.filter((id) => !selected.includes(id));
  if (name !== course.name || added.length > 0) {
    out.push({
      action: 'save',
      course: {
        id: course.id,
        ...(name !== course.name ? { name } : {}),
        ...(added.length > 0
          ? { rosterIds: [...course.rosterIds, ...added] }
          : {}),
        expectedUpdatedAt: course.updatedAt,
      },
    });
  }
  // D5: each removed class becomes its own Course with a copy of the Agenda and links.
  for (const rosterId of removed)
    out.push({ action: 'unlink', courseId: course.id, rosterId });
  return out;
}
