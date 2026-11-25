// Shared tree walks for board collections and library folders (one tree shape, one set of helpers).
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

// Tree-flatten: tree order, orphans and parent cycles surfaced at the top level.
export interface TreeNodeLike extends TreeNode {
  order: number;
}

export interface FlatTreeRow<T> {
  node: T;
  depth: number;
  /** Parent the row is shown under; null for a surfaced orphan or cycle member. */
  effectiveParentId: string | null;
}

/** Follows parent links until they loop, returning a member of the cycle the chain ends in. */
export const cycleMemberOfTree = <T extends TreeNodeLike>(
  start: T,
  byId: ReadonlyMap<string, T>,
  parentOf: (node: T) => string | null
): T => {
  const seen = new Set<string>();
  let n = start;
  while (!seen.has(n.id)) {
    seen.add(n.id);
    const parentId = parentOf(n);
    const up = parentId != null ? byId.get(parentId) : undefined;
    if (!up) break;
    n = up;
  }
  return n;
};

/** Tree-ordered rows with nesting depth; every node appears exactly once. */
export const flattenTree = <T extends TreeNodeLike>(
  nodes: readonly T[],
  parentOf: (node: T) => string | null
): FlatTreeRow<T>[] => {
  const childrenByParent = new Map<string | null, T[]>();
  for (const n of nodes) {
    const bucket = childrenByParent.get(parentOf(n)) ?? [];
    bucket.push(n);
    childrenByParent.set(parentOf(n), bucket);
  }
  for (const bucket of childrenByParent.values()) {
    bucket.sort((a, b) => a.order - b.order);
  }
  const knownIds = new Set(nodes.map((n) => n.id));
  const out: FlatTreeRow<T>[] = [];
  const visited = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const k of childrenByParent.get(parent) ?? []) {
      if (visited.has(k.id)) continue;
      visited.add(k.id);
      out.push({ node: k, depth, effectiveParentId: parent });
      walk(k.id, depth + 1);
    }
  };
  walk(null, 0);
  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  for (const n of sorted) {
    const parentId = parentOf(n);
    if (parentId == null || knownIds.has(parentId) || visited.has(n.id)) {
      continue;
    }
    visited.add(n.id);
    out.push({ node: n, depth: 0, effectiveParentId: null });
    walk(n.id, 1);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const start of sorted) {
    if (visited.has(start.id)) continue;
    const n = cycleMemberOfTree(start, byId, parentOf);
    visited.add(n.id);
    out.push({ node: n, depth: 0, effectiveParentId: null });
    walk(n.id, 1);
  }
  return out;
};
