// Shared cycle-safe descendant walk for useFolders/useCollections' identical tree shapes.
export interface TreeNode {
  id: string;
}

// Collects descendant ids of rootId (excluding rootId), depth-first; a visited set bounds it against a corrupted/cyclic parent graph.
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
  // Seeded with rootId so a cycle looping back to the root can't re-walk it.
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
