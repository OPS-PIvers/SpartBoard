/** The Schoology sections a session has seen; a new one launching changes it so names refetch. */
export function ltiSectionsKey(
  session:
    | {
        classIds?: unknown;
        classPeriodByClassId?: Record<string, string>;
        ltiNrps?: boolean;
      }
    | null
    | undefined
): string {
  if (session?.ltiNrps !== true) return '';
  const classIds: unknown[] = Array.isArray(session.classIds)
    ? session.classIds
    : [];
  const ids = new Set(
    [...classIds, ...Object.keys(session.classPeriodByClassId ?? {})].filter(
      (id): id is string =>
        typeof id === 'string' && id.startsWith('schoology:')
    )
  );
  return [...ids].sort().join(',');
}
