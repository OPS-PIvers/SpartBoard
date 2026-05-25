import { useCallback, useState } from 'react';
import { DrawableObject } from '@/types';
import { DrawingCommand, applyCommand } from './commands';

interface UseCommandStackOptions {
  /** Current canonical objects array. The stack reads this on each action so
   *  undo/redo always apply against the latest snapshot — even if a remote
   *  sync changed it between actions. */
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
  /** Drop the whole history (used on Clear-All for callers that want a
   *  hard reset; not currently used because Clear-All ships as a single
   *  bulk command instead, but exposed for future flexibility). */
  clear: () => void;
}

/**
 * Undo/redo stack for DrawingWidget object mutations.
 *
 * Architectural notes:
 *  - State (`past` / `future`) lives in `useState`, NOT `useRef`. The widget
 *    toolbar's Undo / Redo buttons disable on `!canUndo` / `!canRedo`; a
 *    `useRef` write wouldn't trigger the re-render those buttons need to
 *    stay accurate. Functional setters keep concurrent pushes from dropping
 *    each other.
 *  - `applyCommand` is pure — closures over Firestore live in
 *    `onObjectsChange`, not here. That keeps the stack trivially testable.
 *  - Commands are in-memory only; the hook does NOT persist them. They die
 *    on unmount (dashboard switch, page reload, widget delete) by design,
 *    matching every comparable whiteboard tool.
 */
export const useCommandStack = ({
  objects,
  onObjectsChange,
}: UseCommandStackOptions): UseCommandStackResult => {
  const [past, setPast] = useState<DrawingCommand[]>([]);
  const [future, setFuture] = useState<DrawingCommand[]>([]);

  const push = useCallback(
    (cmd: DrawingCommand) => {
      const next = applyCommand(objects, cmd, 'forward');
      // Functional setters so two near-simultaneous push() calls don't
      // collapse into one — e.g. a transform-commit fired in the same tick
      // as a Clear-All button press would otherwise lose history.
      setPast((prev) => [...prev, cmd]);
      // Any new action invalidates the redo branch — standard undo semantics.
      setFuture((prev) => (prev.length === 0 ? prev : []));
      onObjectsChange(next);
    },
    [objects, onObjectsChange]
  );

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const cmd = past[past.length - 1];
    const next = applyCommand(objects, cmd, 'reverse');
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [...prev, cmd]);
    onObjectsChange(next);
  }, [past, objects, onObjectsChange]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const cmd = future[future.length - 1];
    const next = applyCommand(objects, cmd, 'forward');
    setFuture((prev) => prev.slice(0, -1));
    setPast((prev) => [...prev, cmd]);
    onObjectsChange(next);
  }, [future, objects, onObjectsChange]);

  const clear = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  return {
    push,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    clear,
  };
};
