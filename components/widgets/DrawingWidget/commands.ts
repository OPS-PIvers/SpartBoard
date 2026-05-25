import { DrawableObject } from '@/types';

/**
 * In-memory undo/redo command for the DrawingWidget.
 *
 * Commands are NOT persisted — they live in the widget instance's
 * `useCommandStack` hook and are cleared on widget unmount, page reload, or
 * dashboard switch. This matches the standard whiteboard behavior (Jamboard,
 * SMART Notebook, Figma) and avoids both the storage cost and the conflict
 * semantics of synced undo histories.
 *
 * Each command captures enough state to be replayed in either direction
 * (forward = apply, reverse = undo) without touching anything outside the
 * `DrawableObject[]` array. The pure `applyCommand` helper is the single
 * authority on how each kind mutates that array — both the command stack and
 * any future replay (e.g. multi-page navigation in Wave 6) call through it.
 */
export type DrawingCommand =
  | { kind: 'add'; object: DrawableObject }
  | { kind: 'remove'; object: DrawableObject }
  | { kind: 'update'; before: DrawableObject; after: DrawableObject }
  | { kind: 'reorder'; objectId: string; fromZ: number; toZ: number }
  /**
   * Bulk-remove used by the Clear All action. We hold the full pre-clear
   * snapshot so a single undo restores every object in one step (matches the
   * design spec's "Clear All as a single bulk-remove command" decision —
   * a deliberate behavior change from today's irreversible clear).
   */
  | { kind: 'clear'; objects: DrawableObject[] };

export type CommandDirection = 'forward' | 'reverse';

/**
 * Pure: apply a single command in either direction. Returns a NEW
 * `DrawableObject[]` array — never mutates the input. This is the only place
 * that knows how each command kind translates into object-list changes; both
 * `useCommandStack` and any future replay machinery must go through here.
 */
export const applyCommand = (
  objects: readonly DrawableObject[],
  cmd: DrawingCommand,
  direction: CommandDirection
): DrawableObject[] => {
  switch (cmd.kind) {
    case 'add': {
      // Forward = add; Reverse = remove. If the id is already present on a
      // forward apply we replace it (defensive against double-apply), and if
      // it's already absent on a reverse apply we no-op (defensive against
      // double-undo).
      if (direction === 'forward') {
        const filtered = objects.filter((o) => o.id !== cmd.object.id);
        return [...filtered, cmd.object];
      }
      return objects.filter((o) => o.id !== cmd.object.id);
    }
    case 'remove': {
      // Forward = remove; Reverse = re-insert the captured object snapshot.
      if (direction === 'forward') {
        return objects.filter((o) => o.id !== cmd.object.id);
      }
      const filtered = objects.filter((o) => o.id !== cmd.object.id);
      return [...filtered, cmd.object];
    }
    case 'update': {
      // Forward = before -> after; Reverse = after -> before. We always
      // match by id, never by reference, so out-of-band mutations (e.g. a
      // remote sync) don't strand the undo.
      //
      // Runtime invariant: the two snapshots must describe the same object.
      // A future caller building an `update` from two different objects
      // (e.g. "convert this rect into an ellipse") would silently get a
      // one-way command without this guard.
      if (cmd.before.id !== cmd.after.id) {
        throw new Error(
          `applyCommand: update command id mismatch (before.id=${cmd.before.id} after.id=${cmd.after.id}). update is a transform-in-place; build separate remove+add commands for id changes.`
        );
      }
      const target = direction === 'forward' ? cmd.after : cmd.before;
      return objects.map((o) => (o.id === cmd.after.id ? target : o));
    }
    case 'reorder': {
      const targetZ = direction === 'forward' ? cmd.toZ : cmd.fromZ;
      return objects.map((o) =>
        o.id === cmd.objectId ? { ...o, z: targetZ } : o
      );
    }
    case 'clear': {
      // Forward = wipe to empty; Reverse = restore the captured snapshot.
      if (direction === 'forward') return [];
      // Defensive copy so the caller can't mutate our stored snapshot.
      return [...cmd.objects];
    }
    default: {
      // Exhaustiveness guard: TypeScript flags this as unreachable today,
      // but a future kind added to the union would surface as a compile
      // error here instead of silently falling through. We stringify `cmd`
      // (not the narrowed-to-`never` `_exhaustive`) so the runtime error
      // surfaces the actual command shape — `_exhaustive` exists only to
      // pin the compile-time assertion; at runtime it's still `cmd`.
      const _exhaustive: never = cmd;
      void _exhaustive;
      throw new Error(
        `applyCommand: unhandled command kind ${JSON.stringify(cmd)}`
      );
    }
  }
};
