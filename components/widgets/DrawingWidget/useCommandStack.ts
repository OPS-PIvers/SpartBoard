import { useCallback, useMemo, useState } from 'react';
import { DrawableObject } from '@/types';
import { DrawingCommand, applyCommand } from './commands';

interface UseCommandStackOptions {
  /** Stable key (typically the active page id) under which `past`/`future`
   *  are stored. Switching the key surfaces a different per-key stack so
   *  each page maintains its own undo history. (Phase 2 PR 2.3.) */
  pageKey: string;
  /** Current canonical objects array for the active page. The stack reads
   *  this on each action so undo/redo always apply against the latest
   *  snapshot — even if a remote sync changed it between actions. */
  objects: readonly DrawableObject[];
  /** Persistence sink — receives the new objects array after each
   *  push/undo/redo. The caller wires this to whatever its single
   *  `updateWidget`-equivalent write path is. */
  onObjectsChange: (next: DrawableObject[]) => void;
}

interface UseCommandStackResult {
  /** Apply a command forward and remember it for undo. Clears the redo
   *  stack — newer history always invalidates the redo branch. */
  push: (cmd: DrawingCommand) => void;
  /** Reverse the most recent command and move it onto the redo stack. */
  undo: () => void;
  /** Re-apply the most recently undone command and move it back onto past. */
  redo: () => void;
  /** True when there is at least one command available to undo. */
  canUndo: boolean;
  /** True when there is at least one command available to redo. */
  canRedo: boolean;
  /** Drop the whole history for the active page only. */
  clear: () => void;
  /** Forget all history associated with `pageKey` (used when a page is
   *  deleted so the stack record doesn't grow unbounded across deletions). */
  forgetPage: (pageKey: string) => void;
}

interface PerPageStack {
  past: DrawingCommand[];
  future: DrawingCommand[];
}

const EMPTY_STACK: PerPageStack = { past: [], future: [] };

/**
 * Undo/redo stack for DrawingWidget object mutations, scoped per page.
 *
 * Phase 2 PR 2.3 introduced multi-page widgets. Each page has its own
 * independent undo history — undoing on page 2 must not replay an edit from
 * page 1. We model that by storing `Record<pageKey, PerPageStack>` in a
 * single `useState` and slicing the active page's stack on each render.
 *
 * Architectural notes:
 *  - State lives in `useState`, NOT `useRef`. The widget toolbar's Undo /
 *    Redo buttons disable on `!canUndo` / `!canRedo`; a `useRef` write
 *    wouldn't trigger the re-render those buttons need to stay accurate.
 *    Functional setters keep concurrent pushes from dropping each other.
 *  - `applyCommand` is pure — closures over Firestore live in
 *    `onObjectsChange`, not here. That keeps the stack trivially testable.
 *  - Commands are in-memory only; the hook does NOT persist them. They die
 *    on unmount (dashboard switch, page reload, widget delete) by design,
 *    matching every comparable whiteboard tool.
 *  - On page deletion, callers should invoke `forgetPage(deletedId)` to
 *    drop the GC'd page's history. Keeping it around is harmless (the
 *    Widget's `pageKey` will never address it again) but wastes memory.
 */
export const useCommandStack = ({
  pageKey,
  objects,
  onObjectsChange,
}: UseCommandStackOptions): UseCommandStackResult => {
  const [stacks, setStacks] = useState<Record<string, PerPageStack>>({});

  const active = stacks[pageKey] ?? EMPTY_STACK;

  const push = useCallback(
    (cmd: DrawingCommand) => {
      const next = applyCommand(objects, cmd, 'forward');
      // Functional setter so two near-simultaneous push() calls don't
      // collapse into one — e.g. a transform-commit fired in the same tick
      // as a Clear-All button press would otherwise lose history.
      setStacks((prev) => {
        const cur = prev[pageKey] ?? EMPTY_STACK;
        return {
          ...prev,
          [pageKey]: {
            past: [...cur.past, cmd],
            // Any new action invalidates the redo branch — standard undo
            // semantics, scoped to this page.
            future: [],
          },
        };
      });
      onObjectsChange(next);
    },
    [pageKey, objects, onObjectsChange]
  );

  const undo = useCallback(() => {
    if (active.past.length === 0) return;
    const cmd = active.past[active.past.length - 1];
    const next = applyCommand(objects, cmd, 'reverse');
    setStacks((prev) => {
      const cur = prev[pageKey] ?? EMPTY_STACK;
      return {
        ...prev,
        [pageKey]: {
          past: cur.past.slice(0, -1),
          future: [...cur.future, cmd],
        },
      };
    });
    onObjectsChange(next);
  }, [active.past, pageKey, objects, onObjectsChange]);

  const redo = useCallback(() => {
    if (active.future.length === 0) return;
    const cmd = active.future[active.future.length - 1];
    const next = applyCommand(objects, cmd, 'forward');
    setStacks((prev) => {
      const cur = prev[pageKey] ?? EMPTY_STACK;
      return {
        ...prev,
        [pageKey]: {
          past: [...cur.past, cmd],
          future: cur.future.slice(0, -1),
        },
      };
    });
    onObjectsChange(next);
  }, [active.future, pageKey, objects, onObjectsChange]);

  const clear = useCallback(() => {
    setStacks((prev) => {
      if (!prev[pageKey]) return prev;
      const next = { ...prev };
      next[pageKey] = EMPTY_STACK;
      return next;
    });
  }, [pageKey]);

  const forgetPage = useCallback((key: string) => {
    setStacks((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _dropped, ...rest } = prev;
      return rest;
    });
  }, []);

  return useMemo(
    () => ({
      push,
      undo,
      redo,
      canUndo: active.past.length > 0,
      canRedo: active.future.length > 0,
      clear,
      forgetPage,
    }),
    [
      push,
      undo,
      redo,
      active.past.length,
      active.future.length,
      clear,
      forgetPage,
    ]
  );
};
