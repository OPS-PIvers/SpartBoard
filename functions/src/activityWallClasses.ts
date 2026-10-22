// Which classes an Activity Wall targets once shared-board colleagues add their own.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const storedIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : [];

export const memberClassMap = (value: unknown): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  if (!isRecord(value)) return out;
  for (const [uid, ids] of Object.entries(value)) {
    const list = storedIds(ids);
    if (list.length > 0) out[uid] = list;
  }
  return out;
};

/** The owner's own targeted classes (legacy walls kept a single `classId`). */
export const ownerClassIds = (entry: Record<string, unknown>): string[] => {
  const ids = storedIds(entry.classIds);
  return ids.length > 0
    ? ids
    : typeof entry.classId === 'string' && entry.classId
      ? [entry.classId]
      : [];
};

/** Mirrors effectiveWallClassIds in utils/activityWallNormalize.ts: colleagues' classes count only once the owner targets classes. */
export const effectiveWallClassIds = (
  entry: Record<string, unknown>
): string[] => {
  const own = ownerClassIds(entry);
  if (own.length === 0) return [];
  return [
    ...new Set([
      ...own,
      ...Object.values(memberClassMap(entry.memberClassIds)).flat(),
    ]),
  ];
};
