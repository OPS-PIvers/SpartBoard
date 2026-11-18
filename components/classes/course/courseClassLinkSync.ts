// Course menu "Sync with ClassLink": each section merges from the ClassLink class it is already linked to.
import type { ClassLinkData, ClassRoster, Student } from '@/types';
import { mergeClassLinkStudents } from '../mergeClassLinkStudents';

export interface CourseSyncPlan {
  updates: { rosterId: string; students: Student[] }[];
  added: number;
  /** Sections with no ClassLink class linked yet. */
  unlinked: string[];
  /** Sections whose ClassLink class is no longer on this teacher's ClassLink list. */
  notFound: string[];
}

export function planCourseClassLinkSync(
  sections: readonly Pick<
    ClassRoster,
    'id' | 'name' | 'classlinkClassId' | 'students'
  >[],
  data: ClassLinkData
): CourseSyncPlan {
  const plan: CourseSyncPlan = {
    updates: [],
    added: 0,
    unlinked: [],
    notFound: [],
  };
  for (const s of sections) {
    if (!s.classlinkClassId) {
      plan.unlinked.push(s.name);
      continue;
    }
    const incoming = data.studentsByClass[s.classlinkClassId];
    if (!incoming) {
      plan.notFound.push(s.name);
      continue;
    }
    const result = mergeClassLinkStudents(s.students, incoming);
    plan.added += result.addedCount;
    plan.updates.push({ rosterId: s.id, students: result.students });
  }
  return plan;
}
