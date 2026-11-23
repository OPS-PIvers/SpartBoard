// Course menu "Sync with ClassLink": each section merges from the ClassLink class it is already linked to.
import type { ClassLinkData, ClassRoster, Student } from '@/types';
import { mergeClassLinkStudents } from '../mergeClassLinkStudents';

export interface CourseSyncPlan {
  updates: { rosterId: string; students: Student[] }[];
  added: number;
  removed: number;
  /** Sections where removal was refused because most linked students were missing. */
  removalSkipped: string[];
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
    removed: 0,
    removalSkipped: [],
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
    const result = mergeClassLinkStudents(s.students, incoming, {
      removeDeparted: true,
    });
    plan.added += result.addedCount;
    plan.removed += result.removedCount;
    if (result.removalSkipped) plan.removalSkipped.push(s.name);
    plan.updates.push({ rosterId: s.id, students: result.students });
  }
  return plan;
}
