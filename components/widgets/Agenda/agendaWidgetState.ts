// Pure helpers for the Agenda widget (docs/plans/COURSE_AND_AGENDA.md D16, D24).
import type { AgendaConfig, ClassRoster } from '@/types';
import { isDriveFileId, type Course } from '@/utils/course/contract';
import { courseGroups } from '@/utils/course/courseGroups';

export type AgendaRoster = Pick<ClassRoster, 'id' | 'name'>;

/** One row of the Course picker: a saved Course, or a class in no Course yet. */
export interface AgendaChoice {
  key: string;
  label: string;
  course: Course | null;
  rosters: AgendaRoster[];
}

/** A re-check closer than this to the last one is skipped, so My Classes and several widgets don't all check at once. */
export const DECK_CHECK_MIN_GAP_MS = 5 * 60_000;

export function agendaChoices(
  courses: readonly Course[],
  rosters: readonly AgendaRoster[]
): AgendaChoice[] {
  return courseGroups(courses, rosters).map((g) => ({
    key: g.course ? `course:${g.course.id}` : `roster:${g.rosters[0].id}`,
    label: g.course?.name ?? g.rosters[0].name,
    course: g.course,
    rosters: g.rosters,
  }));
}

/** The picked Course by id, else the one now holding the picked class; null when neither is left. */
export function resolveAgendaChoice(
  config: AgendaConfig,
  choices: readonly AgendaChoice[]
): AgendaChoice | null {
  if (config.courseId) {
    const byId = choices.find((c) => c.course?.id === config.courseId);
    if (byId) return byId;
  }
  if (config.rosterId) {
    const byRoster = choices.find((c) =>
      c.rosters.some((r) => r.id === config.rosterId)
    );
    if (byRoster) return byRoster;
  }
  return null;
}

export function hasAgendaPick(config: AgendaConfig): boolean {
  return !!config.courseId || !!config.rosterId;
}

export function pickPatch(choice: AgendaChoice): AgendaConfig {
  return { courseId: choice.course?.id, rosterId: choice.rosters[0]?.id };
}

/** The deck's first slide (D8), without Slides' toolbar; null for an id that isn't a Drive file id. */
export function agendaEmbedUrl(fileId: string): string | null {
  if (!isDriveFileId(fileId)) return null;
  return `https://docs.google.com/presentation/d/${fileId}/embed?start=false&loop=false&rm=minimal`;
}

export function agendaOpenUrl(fileId: string): string | null {
  if (!isDriveFileId(fileId)) return null;
  return `https://docs.google.com/presentation/d/${fileId}/edit`;
}

/** D24: re-check a Course's deck unless it was checked moments ago. */
export function shouldCheckDeck(course: Course | null, now: number): boolean {
  if (!course?.agenda) return false;
  const last = course.deckCheck?.checkedAt;
  return typeof last !== 'number' || now - last >= DECK_CHECK_MIN_GAP_MS;
}

/** True when the last check found a deck students can't open. */
export function deckBlocksStudents(course: Course | null): boolean {
  return !!course?.agenda && course.deckCheck?.sharing === 'private';
}
