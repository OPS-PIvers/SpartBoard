// Who may hold a poll join code: its first holder plus Synced-board colleagues the server checked.
type Doc = Record<string, unknown>;

/** The uids a poll_codes pointer may move between, its current holder included. */
export function pointerMembers(pointer: Doc | undefined): string[] {
  if (!pointer) return [];
  const listed = Array.isArray(pointer.memberUids)
    ? pointer.memberUids.filter((u): u is string => typeof u === 'string')
    : [];
  const holder = pointer.teacherUid;
  return typeof holder === 'string' && !listed.includes(holder)
    ? [holder, ...listed]
    : listed;
}
