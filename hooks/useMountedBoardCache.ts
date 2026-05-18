import { useEffect, useRef, useMemo } from 'react';
import type { Dashboard } from '@/types';
import { MOUNTED_BOARD_CACHE_SIZE } from '@/config/mountedBoardCache';

/**
 * Maintains an LRU set of Dashboard IDs that should be mounted.
 *
 * Inputs:
 * - `activeId` — the currently visible Board id. Bumped to most-recent on
 *   every change.
 * - `dashboards` — full Dashboard list; we filter out IDs that no longer
 *   exist (deleted) before returning, so the layer never tries to render
 *   a stale Board.
 * - `pinnedIds` — IDs that MUST stay mounted regardless of LRU position.
 *   Used to keep live-session hosts pinned so a session never dies just
 *   because the teacher switched away briefly.
 *
 * Returns the Dashboards (in LRU-old-to-new order) that should be mounted.
 */
export const useMountedBoardCache = (
  activeId: string | null,
  dashboards: Dashboard[],
  pinnedIds: Set<string> = new Set()
): Dashboard[] => {
  // Ordered array — oldest first, newest last. Operates by ref so
  // re-renders driven by widget state inside hidden Boards don't trigger
  // a setState/rerender cascade in the parent.
  const lruRef = useRef<string[]>([]);

  // Bump on activeId change (kept synchronous so the first render sees
  // the new id at the end of the array).
  useEffect(() => {
    if (!activeId) return;
    const existing = lruRef.current.filter((id) => id !== activeId);
    lruRef.current = [...existing, activeId];
  }, [activeId]);

  // Housekeeping: prune stale IDs from the ref when the dashboard list
  // changes (e.g. a Board was deleted). Doing it in an effect rather than
  // inside useMemo keeps the memoized computation pure. The deps are
  // `dashboards` because that's what determines which IDs are stale.
  useEffect(() => {
    const knownIds = new Set(dashboards.map((d) => d.id));
    lruRef.current = lruRef.current.filter((id) => knownIds.has(id));
  }, [dashboards]);

  return useMemo(() => {
    const knownIds = new Set(dashboards.map((d) => d.id));
    // PURE prune: compute a local view without mutating the ref. The
    // useMemo body must be side-effect free (StrictMode dev double-runs
    // it). The ref is pruned later in a useEffect for housekeeping.
    const pruned = lruRef.current.filter((id) => knownIds.has(id));

    // Force `activeId` to the tail even on the first render (the effect
    // that appends to lruRef runs AFTER the first paint; this guarantees
    // the active Board is visible immediately).
    let working = pruned;
    if (activeId && knownIds.has(activeId)) {
      working = [...working.filter((id) => id !== activeId), activeId];
    }

    // Cap to MOUNTED_BOARD_CACHE_SIZE, but never evict a pinned ID.
    // Walk from oldest forward, dropping non-pinned entries until we fit.
    const cap = Math.max(1, MOUNTED_BOARD_CACHE_SIZE);
    let pinnedCount = 0;
    for (const id of working) if (pinnedIds.has(id)) pinnedCount += 1;
    const capForLru = Math.max(1, cap - pinnedCount);

    const pinnedSlots: string[] = [];
    const lruSlots: string[] = [];
    for (const id of working) {
      if (pinnedIds.has(id)) pinnedSlots.push(id);
      else lruSlots.push(id);
    }
    // Keep only the most-recent `capForLru` non-pinned entries.
    const keptLru =
      lruSlots.length > capForLru ? lruSlots.slice(-capForLru) : lruSlots;

    const orderedKeptIds = new Set([...pinnedSlots, ...keptLru]);
    const ordered = working.filter((id) => orderedKeptIds.has(id));
    return ordered
      .map((id) => dashboards.find((d) => d.id === id))
      .filter((d): d is Dashboard => Boolean(d));
  }, [activeId, dashboards, pinnedIds]);
};
