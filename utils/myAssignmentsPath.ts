export type StudentClassTab = 'assignments' | 'grades';

const COURSE_LINK_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** `/my-assignments/{classId}/grades` (D35), or a Course's Class page link `/my-assignments/course/{linkId}` (D18). */
export function parseMyAssignmentsPath(pathname: string): {
  classId: string | null;
  tab: StudentClassTab;
  courseLinkId: string | null;
} {
  const [, root, rawClass, rawTab] = pathname.split('/');
  if (root !== 'my-assignments' || !rawClass) {
    return { classId: null, tab: 'assignments', courseLinkId: null };
  }
  if (rawClass === 'course') {
    const linkId = rawTab && COURSE_LINK_ID.test(rawTab) ? rawTab : null;
    return { classId: null, tab: 'assignments', courseLinkId: linkId };
  }
  let classId: string | null = null;
  try {
    classId = decodeURIComponent(rawClass);
  } catch {
    classId = null;
  }
  return {
    classId,
    tab: rawTab === 'grades' ? 'grades' : 'assignments',
    courseLinkId: null,
  };
}

/** True for a Course's Class page link path, which must come back after sign-in. */
export function isCourseLinkPath(pathname: string): boolean {
  const [, root, course, linkId, extra] = pathname.split('/');
  return (
    root === 'my-assignments' &&
    course === 'course' &&
    COURSE_LINK_ID.test(linkId ?? '') &&
    extra === undefined
  );
}

/** The first of the link's classes the student is in, or null. */
export function pickCourseLinkClass(
  linkClassIds: readonly unknown[],
  studentClassIds: readonly string[]
): string | null {
  const mine = new Set(studentClassIds);
  for (const id of linkClassIds) {
    if (typeof id === 'string' && mine.has(id)) return id;
  }
  return null;
}

export function myAssignmentsPath(
  classId: string | null,
  tab: StudentClassTab
): string {
  if (!classId) return '/my-assignments';
  const base = `/my-assignments/${encodeURIComponent(classId)}`;
  return tab === 'grades' ? `${base}/grades` : base;
}
