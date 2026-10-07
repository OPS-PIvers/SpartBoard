/** The Schoology sections a session has seen; a new one launching changes it so names refetch. */
export function ltiSectionsKey(
  session:
    | {
        classIds?: string[];
        classPeriodByClassId?: Record<string, string>;
      }
    | null
    | undefined
): string {
  if (!session) return '';
  const ids = new Set(
    [
      ...(session.classIds ?? []),
      ...Object.keys(session.classPeriodByClassId ?? {}),
    ].filter((id) => id.startsWith('schoology:'))
  );
  return [...ids].sort().join(',');
}
