// Groups a teacher's classes by Course; a class in no Course is a Course of one (D1).
import type { ClassRoster } from '@/types';
import type { Course } from './contract';

export interface CourseGroup<R extends Pick<ClassRoster, 'id'>> {
  /** Null for a class in no saved Course yet; saving creates its Course. */
  course: Course | null;
  rosters: R[];
}

/** The Course holding `rosterId`, or null. */
export function courseForRoster(
  courses: readonly Course[],
  rosterId: string
): Course | null {
  return courses.find((c) => c.rosterIds.includes(rosterId)) ?? null;
}

/** One group per Course in roster order, then one per class with no Course; Course rosters that no longer exist are dropped. */
export function courseGroups<R extends Pick<ClassRoster, 'id'>>(
  courses: readonly Course[],
  rosters: readonly R[]
): CourseGroup<R>[] {
  const out: CourseGroup<R>[] = [];
  const seen = new Set<string>();
  for (const roster of rosters) {
    if (seen.has(roster.id)) continue;
    const course = courseForRoster(courses, roster.id);
    if (!course) {
      seen.add(roster.id);
      out.push({ course: null, rosters: [roster] });
      continue;
    }
    const members = rosters.filter((r) => course.rosterIds.includes(r.id));
    members.forEach((r) => seen.add(r.id));
    out.push({ course, rosters: members });
  }
  return out;
}
