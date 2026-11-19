// Course > section > student grouping for the Results print student picker.
import type { ClassRoster } from '@/types';
import type { Course } from '@/utils/course/contract';
import { courseGroups } from '@/utils/course/courseGroups';

export interface PrintTreeSection {
  id: string;
  name: string;
  keys: string[];
}

export type PrintTreeNode =
  | { kind: 'course'; id: string; name: string; sections: PrintTreeSection[] }
  | { kind: 'section'; section: PrintTreeSection };

export const NO_SECTION_NAME = 'No class period';

/** Students grouped by class period, matched to rosters by name, then by Course when a Course holds 2+ of them. */
export function buildPrintStudentTree(
  rows: readonly { key: string; period: string | null }[],
  rosters: readonly Pick<ClassRoster, 'id' | 'name'>[],
  courses: readonly Course[]
): PrintTreeNode[] {
  const byName = new Map<string, PrintTreeSection>();
  const sections: PrintTreeSection[] = [];
  for (const row of rows) {
    const name = row.period ?? NO_SECTION_NAME;
    let section = byName.get(name);
    if (!section) {
      const roster = row.period
        ? rosters.find((r) => r.name === row.period)
        : undefined;
      section = {
        id: roster?.id ?? `period:${name}`,
        name,
        keys: [],
      };
      byName.set(name, section);
      sections.push(section);
    }
    section.keys.push(row.key);
  }
  return courseGroups(courses, sections).map((g) =>
    g.course && g.rosters.length > 1
      ? {
          kind: 'course' as const,
          id: g.course.id,
          name: g.course.name,
          sections: g.rosters,
        }
      : { kind: 'section' as const, section: g.rosters[0] }
  );
}
