// Pure rules behind Agenda setup (docs/plans/COURSE_AND_AGENDA.md D9, D10, D18, D24).
import type {
  Course,
  CourseDeckCheck,
  CourseDeckSharing,
  CourseInput,
} from '@/utils/course/contract';
import type { CourseGroup } from '@/utils/course/courseGroups';
import type { CourseRoster } from '../types';

/** D24: a check younger than this with the same reading is not written again. */
export const DECK_CHECK_REFRESH_MS = 6 * 60 * 60 * 1000;

/** D10: Orono for students, anyone only while the family link is on. */
export function neededSharing(
  course: Pick<Course, 'familyLink'> | null
): 'domain' | 'anyone' {
  return course?.familyLink?.on ? 'anyone' : 'domain';
}

export type SharingProblem = 'students' | 'families' | 'unknown' | null;

/** What the notice says is wrong with the deck's sharing, or null when it is fine. */
export function sharingProblem(
  sharing: CourseDeckSharing | null,
  needed: 'domain' | 'anyone'
): SharingProblem {
  if (sharing === null) return null;
  if (sharing === 'unknown') return 'unknown';
  if (sharing === 'private') return 'students';
  if (needed === 'anyone' && sharing !== 'anyone') return 'families';
  return null;
}

/** D24: write a check when none exists, the reading changed, or the last one is old. */
export function shouldRecordCheck(
  previous: CourseDeckCheck | null,
  next: { sharing: CourseDeckSharing; modifiedAt: number | null },
  now: number
): boolean {
  if (!previous) return true;
  // A deck that stopped answering keeps its last known edit time.
  if (next.modifiedAt === null && previous.modifiedAt !== null) return false;
  if (previous.sharing !== next.sharing) return true;
  if (previous.modifiedAt !== next.modifiedAt) return true;
  return now - previous.checkedAt >= DECK_CHECK_REFRESH_MS;
}

/** A patch for the group's Course; a class in no Course yet gets one named after it. */
export function courseSaveInput(
  group: CourseGroup<CourseRoster>,
  patch: Pick<CourseInput, 'agenda' | 'pinnedLinks'>
): CourseInput {
  if (group.course) {
    return {
      id: group.course.id,
      expectedUpdatedAt: group.course.updatedAt,
      ...patch,
    };
  }
  const roster = group.rosters[0];
  return {
    name: roster.name,
    rosterIds: group.rosters.map((r) => r.id),
    ...patch,
  };
}

/** D18: the Course's one Class page link, or null when no class in it has a Class page. */
export function classPageLink(
  course: Pick<Course, 'linkId' | 'rosterClassIds'> | null,
  origin: string
): string | null {
  if (!course?.linkId) return null;
  if (Object.keys(course.rosterClassIds ?? {}).length === 0) return null;
  return `${origin}/my-assignments/course/${encodeURIComponent(course.linkId)}`;
}

/** The deck in Google Slides. */
export function deckUrl(fileId: string): string {
  return `https://docs.google.com/presentation/d/${encodeURIComponent(fileId)}/edit`;
}
