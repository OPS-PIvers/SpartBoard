/**
 * Shared descendant-collecting walk for the library folder tree (`useFolders`)
 * and the Board collection tree (`useCollections`) — structurally identical
 * hierarchies, each previously carrying its own copy of this recursion.
 *
 * Cycle-safe: `moveFolder`/`moveCollection` already guard against introducing
 * a cycle via `isDescendantOrSelf` (walking UP from the target with a depth
 * cap, "in case of corrupted data"). That guard is a client-side check against
 * a locally-cached snapshot, not a transaction — two concurrent moves from
 * different tabs/devices (A under B, B under A) can each pass their own check
 * against stale state and still land a 2-node cycle once both writes commit.
 * A recursive descendant walk with no visited-set would recurse forever over
 * such a cycle (`RangeError: Maximum call stack size exceeded`), permanently
 * breaking "delete folder" for the whole cyclic branch. `visited` bounds the
 * walk to at most one visit per node regardless of how the graph got
 * corrupted (race, manual Firestore edit, future bug) — the same defensive
 * posture `isDescendantOrSelf` already takes for the ancestor direction.
 */

/** Minimal shape the walk needs: an id plus a parent-id accessor. */
export interface TreeNode {
  id: string;
}

/**
 * Collect every descendant id of `rootId` (children, grandchildren, …) from a
 * flat `nodes` list, given a `getParentId` accessor. Excludes `rootId` itself.
 * Order is depth-first, matching the previous per-hook implementations.
 */
export function collectDescendantIds<T extends TreeNode>(
  rootId: string,
  nodes: readonly T[],
  getParentId: (node: T) => string | null
): string[] {
  const byParent = new Map<string | null, T[]>();
  for (const n of nodes) {
    const parentId = getParentId(n);
    const bucket = byParent.get(parentId) ?? [];
    bucket.push(n);
    byParent.set(parentId, bucket);
  }

  const out: string[] = [];
  // Seeded with rootId so a cycle that loops back to the root can't re-walk
  // it either.
  const visited = new Set<string>([rootId]);
  const walk = (id: string): void => {
    const kids = byParent.get(id) ?? [];
    for (const k of kids) {
      if (visited.has(k.id)) continue;
      visited.add(k.id);
      out.push(k.id);
      walk(k.id);
    }
  };
  walk(rootId);
  return out;
}
