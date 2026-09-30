export type StudentClassTab = 'assignments' | 'grades';

/** `/my-assignments/{classId}/grades` (D35): the class and tab a link opens on. */
export function parseMyAssignmentsPath(pathname: string): {
  classId: string | null;
  tab: StudentClassTab;
} {
  const [, root, rawClass, rawTab] = pathname.split('/');
  if (root !== 'my-assignments' || !rawClass) {
    return { classId: null, tab: 'assignments' };
  }
  let classId: string | null = null;
  try {
    classId = decodeURIComponent(rawClass);
  } catch {
    classId = null;
  }
  return { classId, tab: rawTab === 'grades' ? 'grades' : 'assignments' };
}

export function myAssignmentsPath(
  classId: string | null,
  tab: StudentClassTab
): string {
  if (!classId) return '/my-assignments';
  const base = `/my-assignments/${encodeURIComponent(classId)}`;
  return tab === 'grades' ? `${base}/grades` : base;
}
