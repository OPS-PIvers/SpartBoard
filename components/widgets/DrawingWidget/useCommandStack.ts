import { useCallback, useMemo, useRef, useState } from 'react';
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

  // Live ref tracking the latest objects + stacks. Assigned in render so the
  // closures in `push`/`undo`/`redo` always see the up-to-date snapshot —
  // critical for rapid (synchronous) undo/redo calls (e.g. Cmd+Z auto-repeat)
  // where two invocations in the same tick would otherwise share a stale
  // closure-captured `objects` and apply the SAME reverse twice while the
  // functional setStacks updater correctly chains past/future.
  //
  // The `react-hooks/refs` rule flags this on principle, but the pattern is
  // intentional and the assignments are idempotent (same input → same ref
  // value) so the StrictMode double-invoke is safe.
  const objectsRef = useRef<readonly DrawableObject[]>(objects);
  // eslint-disable-next-line react-hooks/refs
  objectsRef.current = objects;
  const stacksRef = useRef<Record<string, PerPageStack>>(stacks);
  // eslint-disable-next-line react-hooks/refs
  stacksRef.current = stacks;

  const active = stacks[pageKey] ?? EMPTY_STACK;

  const push = useCallback(
    (cmd: DrawingCommand) => {
      const next = applyCommand(objectsRef.current, cmd, 'forward');
      const curStack = stacksRef.current[pageKey] ?? EMPTY_STACK;
      // Synchronously update the stacks ref so a subsequent push/undo/redo
      // in the same tick sees the new history. We still apply via the
      // ref-snapshot (NOT a functional updater) because we've already
      // sourced the cur via the live ref. Two near-simultaneous push()
      // calls correctly chain because the second reads the updated ref.
      const nextStacks: Record<string, PerPageStack> = {
        ...stacksRef.current,
        [pageKey]: {
          past: [...curStack.past, cmd],
          // Any new action invalidates the redo branch — standard undo
          // semantics, scoped to this page.
          future: [],
        },
      };
      stacksRef.current = nextStacks;
      setStacks(nextStacks);
      // Keep the local ref synchronized so a subsequent push/undo/redo in
      // the same tick sees the new objects array.
      objectsRef.current = next;
      onObjectsChange(next);
    },
    [pageKey, onObjectsChange]
  );

  const undo = useCallback(() => {
    const curStack = stacksRef.current[pageKey] ?? EMPTY_STACK;
    if (curStack.past.length === 0) return;
    const cmd = curStack.past[curStack.past.length - 1];
    const next = applyCommand(objectsRef.current, cmd, 'reverse');
    // Update both refs SYNCHRONOUSLY so a second undo() call in the same
    // tick (Cmd+Z auto-repeat) sees the new past/future stacks and the
    // post-reverse objects array. Without this, the second call would grab
    // the SAME cmd again and apply the same reverse, while the functional
    // setStacks updater (correctly) chains past/future — leaving the user
    // with two commands moved to future but only one reverse applied.
    const nextStacks: Record<string, PerPageStack> = {
      ...stacksRef.current,
      [pageKey]: {
        past: curStack.past.slice(0, -1),
        future: [...curStack.future, cmd],
      },
    };
    stacksRef.current = nextStacks;
    setStacks(nextStacks);
    objectsRef.current = next;
    onObjectsChange(next);
  }, [pageKey, onObjectsChange]);

  const redo = useCallback(() => {
    const curStack = stacksRef.current[pageKey] ?? EMPTY_STACK;
    if (curStack.future.length === 0) return;
    const cmd = curStack.future[curStack.future.length - 1];
    const next = applyCommand(objectsRef.current, cmd, 'forward');
    const nextStacks: Record<string, PerPageStack> = {
      ...stacksRef.current,
      [pageKey]: {
        past: [...curStack.past, cmd],
        future: curStack.future.slice(0, -1),
      },
    };
    stacksRef.current = nextStacks;
    setStacks(nextStacks);
    objectsRef.current = next;
    onObjectsChange(next);
  }, [pageKey, onObjectsChange]);

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
      // Avoid the `{[key]: _dropped, ...rest}` destructure-and-drop pattern
      // — some ESLint configs (no-unused-vars without `_`-prefix exemption)
      // would flag `_dropped`. A copy + delete is equally cheap and
      // unambiguously side-effect-free w.r.t. the destination map.
      const next = { ...prev };
      delete next[key];
      return next;
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
