/** Uids in `memberUids` whose `members` entry is not `status: 'removed'`. */
export function activePlcMemberUids(
  plc: Record<string, unknown> | undefined
): Set<string> {
  const ids = Array.isArray(plc?.memberUids)
    ? (plc.memberUids as unknown[])
    : [];
  const members = plc?.members;
  const active = new Set<string>();
  for (const uid of ids) {
    if (typeof uid !== 'string' || uid.length === 0) continue;
    const entry =
      typeof members === 'object' && members !== null
        ? (members as Record<string, unknown>)[uid]
        : undefined;
    const removed =
      typeof entry === 'object' &&
      entry !== null &&
      (entry as Record<string, unknown>).status === 'removed';
    if (!removed) active.add(uid);
  }
  return active;
}
