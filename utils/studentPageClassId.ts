import type { ClassRoster } from '@/types';

/** The class id students carry in their sign-in, or null for a class students can't sign in to. */
export function studentPageClassId(
  roster: Pick<ClassRoster, 'classlinkClassId' | 'testClassId'>
): string | null {
  return roster.classlinkClassId ?? roster.testClassId ?? null;
}
