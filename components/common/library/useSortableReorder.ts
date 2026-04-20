/**
 * useSortableReorder — dnd-kit → persistence helper.
 *
 * Keeps an optimistic `orderedItems` list. When the user drops a card and
 * `LibraryGrid` fires `onReorder`, call `handleReorder` with the new id list;
 * this hook reorders locally, awaits `onCommit`, and reverts if the commit
 * rejects. Exposes `isCommitting` for UI affordances and `error` for inline
 * messages (cleared on the next successful commit).
 *
 * The `orderedItems` state stays in sync with the `items` prop whenever the
 * incoming id set changes — computed during render via a prev-id-comparison
 * pattern (no useEffect). This is the "adjusting state while rendering"
 * escape hatch from the React docs.
 */

import { useCallback, useRef, useState } from 'react';
import type {
  UseSortableReorderOptions,
  UseSortableReorderResult,
} from './types';

function reorderByIds<TItem>(
  items: TItem[],
  getId: (item: TItem) => string,
  orderedIds: string[]
): TItem[] {
  const byId = new Map<string, TItem>();
  for (const item of items) byId.set(getId(item), item);

  const reordered: TItem[] = [];
  const seen = new Set<string>();
  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item !== undefined) {
      reordered.push(item);
      seen.add(id);
    }
  }
  // Append any items whose ids weren't in the requested ordering, preserving
  // their original relative order. This makes the hook safe against partial
  // id lists (e.g. filtered views that only reorder a subset).
  for (const item of items) {
    if (!seen.has(getId(item))) reordered.push(item);
  }
  return reordered;
}

function sameIdList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  for (const id of b) {
    if (!setA.has(id)) return false;
  }
  return true;
}

export function useSortableReorder<TItem>(
  options: UseSortableReorderOptions<TItem>
): UseSortableReorderResult<TItem> {
  const { items, getId, onCommit } = options;

  // Mirror the incoming items optimistically. We always start from the prop.
  const [orderedItems, setOrderedItems] = useState<TItem[]>(items);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track the last prop `items` reference so we can detect upstream changes
  // during render without a useEffect.
  const lastSeenItemsRef = useRef<TItem[]>(items);

  if (lastSeenItemsRef.current !== items) {
    const previousIds = lastSeenItemsRef.current.map(getId);
    const currentIds = items.map(getId);
    const currentOrderedIds = orderedItems.map(getId);

    lastSeenItemsRef.current = items;

    if (!sameIdSet(previousIds, currentIds)) {
      // Id set changed upstream — drop optimistic ordering and re-seed.
      setOrderedItems(items);
    } else if (!sameIdList(currentOrderedIds, currentIds)) {
      // Same ids, but the upstream order differs from our optimistic view.
      // Preserve our optimistic order while absorbing the fresh objects.
      setOrderedItems(reorderByIds(items, getId, currentOrderedIds));
    }
    // Else: ids and order both match — orderedItems is already correct.
    // We intentionally do NOT re-seed with the new array reference here;
    // doing so would trigger an infinite render loop whenever the caller
    // passes an unstable array reference (e.g. a freshly-computed useMemo
    // whose deps include an inline function). Item bodies are rarely
    // mutated without an id change in this codebase, so dropping the
    // "absorb fresh object refs" case is a safe tradeoff.
  }

  const handleReorder = useCallback(
    async (nextOrderedIds: string[]) => {
      const previous = orderedItems;
      const next = reorderByIds(items, getId, nextOrderedIds);

      setOrderedItems(next);
      setIsCommitting(true);
      setError(null);

      try {
        await Promise.resolve(onCommit(nextOrderedIds));
        setError(null);
      } catch (err) {
        // Revert on failure.
        setOrderedItems(previous);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsCommitting(false);
      }
    },
    [orderedItems, items, getId, onCommit]
  );

  return {
    orderedItems,
    handleReorder,
    isCommitting,
    error,
  };
}
