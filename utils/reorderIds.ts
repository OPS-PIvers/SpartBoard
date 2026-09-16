export type DropSide = 'before' | 'after';

/** Moves `activeId` to sit before/after `overId`; null when the order would not change. */
export const placeRelative = (
  ids: readonly string[],
  activeId: string,
  overId: string,
  side: DropSide
): string[] | null => {
  if (activeId === overId) return null;
  if (!ids.includes(activeId) || !ids.includes(overId)) return null;
  const without = ids.filter((id) => id !== activeId);
  const overIndex = without.indexOf(overId);
  const next = [...without];
  next.splice(side === 'before' ? overIndex : overIndex + 1, 0, activeId);
  return next.every((id, i) => id === ids[i]) ? null : next;
};

/** Moves `id` one step up (-1) or down (+1); null at either end. */
export const shiftId = (
  ids: readonly string[],
  id: string,
  dir: 1 | -1
): string[] | null => {
  const from = ids.indexOf(id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
};

/** Re-sequences `subset` inside the slots its members already hold in `allIds`. */
export const mergeSubsetOrder = (
  allIds: readonly string[],
  subset: readonly string[]
): string[] => {
  const members = new Set(subset.filter((id) => allIds.includes(id)));
  const queue = subset.filter((id) => members.has(id));
  return allIds.map((id) => (members.has(id) ? (queue.shift() ?? id) : id));
};
