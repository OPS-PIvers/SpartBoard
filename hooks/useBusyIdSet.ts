/**
 * useBusyIdSet — small reusable busy-state tracker keyed by id.
 *
 * Originally extracted from the Phase 5 duplicate-kebab plumbing in the
 * four library managers (Quiz / VideoActivity / MiniApp / Guided
 * Learning), where the same shape was repeated 5 times: a Set<string>
 * of in-flight ids, an `isBusy(id)` probe for disabling UI affordances,
 * and an async wrapper that adds the id on entry and removes it in a
 * `finally` arm.
 *
 * Contract:
 *   - `isBusy(id)` is true while a `run(id, …)` call is in-flight.
 *   - Calling `run(id, op)` while the same id is already in-flight is
 *     a no-op (returns `undefined`, does NOT invoke `op`). This is the
 *     rapid-double-click guard.
 *   - `op` runs to completion (resolution OR rejection). The id is
 *     ALWAYS removed in `finally`, even on rejection. The rejection
 *     propagates to the caller so existing try/catch sites keep their
 *     toasts/log paths.
 *
 * Implementation note: we keep TWO copies of the busy set — a ref that
 * mutates synchronously (for the no-op-on-busy guard inside `run`) and
 * a React state snapshot that drives re-renders (so `isBusy(id)` flips
 * the disabled state on the kebab item). The ref check is synchronous
 * so a rapid second `run(id)` call sees the in-flight id even before
 * React commits the state update from the first call.
 */

import { useCallback, useRef, useState } from 'react';

export interface UseBusyIdSetResult {
  /** True iff the id is currently in-flight via `run`. */
  isBusy: (id: string) => boolean;
  /**
   * Wrap an async operation. Adds `id` to the busy set before invoking
   * `op`; removes it in `finally`. If the id is already in-flight,
   * returns `undefined` without invoking `op` (rapid-click guard).
   *
   * Returns the result of `op` (or `undefined` for the guard path).
   */
  run: <T>(id: string, op: () => Promise<T>) => Promise<T | undefined>;
}

export function useBusyIdSet(): UseBusyIdSetResult {
  // The ref is the source of truth for the no-op-on-busy check —
  // synchronous reads and writes. The state mirror exists only so
  // components re-render when busy-state changes.
  const busyRef = useRef<Set<string>>(new Set());
  const [, forceSnapshot] = useState<ReadonlySet<string>>(busyRef.current);

  const commit = useCallback(() => {
    // Replace the ref with a NEW Set instance before calling
    // `forceSnapshot`. `useState` short-circuits on `Object.is` equality —
    // passing the same Set reference wouldn't trigger the re-render that
    // we need so consumers' `isBusy(id)` calls return the updated value.
    // The clone is purely a re-render trigger; `isBusy` itself reads
    // `busyRef.current` directly and doesn't depend on the snapshot.
    busyRef.current = new Set(busyRef.current);
    forceSnapshot(busyRef.current);
  }, []);

  const isBusy = useCallback((id: string) => busyRef.current.has(id), []);

  const run = useCallback(
    async <T>(id: string, op: () => Promise<T>): Promise<T | undefined> => {
      // Synchronous read of the live set. React's `setState` updater
      // doesn't run eagerly — checking `busyRef.current.has(id)` here
      // is what prevents a rapid second call from sliding through
      // before the first's state update commits.
      if (busyRef.current.has(id)) return undefined;
      busyRef.current.add(id);
      commit();
      try {
        return await op();
      } finally {
        busyRef.current.delete(id);
        commit();
      }
    },
    [commit]
  );

  return { isBusy, run };
}
