import { DrawableObject, DrawingPage } from '@/types';

/**
 * Pure page-list helpers for the DrawingWidget's multi-page model
 * (Phase 2 PR 2.3). Mirrors the SmartNotebook API shape
 * (`utils/notebookPages.ts`) so future readers see a consistent pattern
 * across widgets.
 *
 * Invariants:
 *  - Every helper takes a readonly `pages` snapshot and returns a NEW array.
 *    No in-place mutation — the Widget passes results straight into
 *    `updateWidget`, which expects a stable referential delta.
 *  - The page list is never allowed to drop to zero. `deletePage` of the
 *    last page replaces it with a fresh empty page so the Widget can always
 *    render `pages[currentPage]`.
 *  - Page `id` is preserved across reorders (so per-page state keyed by id,
 *    e.g. the command stack, survives Move Left / Move Right).
 */

/** Clamp `current` into `[0, pageCount - 1]`. Returns 0 on empty/invalid input. */
export const clampPageIndex = (current: number, pageCount: number): number => {
  if (!Number.isFinite(current)) return 0;
  if (pageCount <= 0) return 0;
  if (current < 0) return 0;
  return Math.min(Math.trunc(current), pageCount - 1);
};

/** Splice a fresh blank page immediately after `afterIndex`. Negative
 *  `afterIndex` inserts at the start; out-of-range values clamp to the end. */
export const insertBlankPage = (
  pages: readonly DrawingPage[],
  afterIndex: number
): DrawingPage[] => {
  const insertAt = Math.min(Math.max(afterIndex + 1, 0), pages.length);
  const next: DrawingPage[] = [...pages];
  next.splice(insertAt, 0, { id: crypto.randomUUID(), objects: [] });
  return next;
};

/** Remove the page at `index`. Returns the new list + the removed page's
 *  objects (for downstream cleanup like per-page command-stack disposal).
 *  Deleting the last remaining page replaces it with a fresh empty page so
 *  callers never have to handle a zero-page state. */
export const deletePage = (
  pages: readonly DrawingPage[],
  index: number
): { pages: DrawingPage[]; removedObjects: DrawableObject[] } => {
  if (index < 0 || index >= pages.length) {
    return { pages: [...pages], removedObjects: [] };
  }
  const removedObjects = pages[index].objects;
  if (pages.length === 1) {
    // Last page → replace with a fresh empty page. New id so any per-id
    // state attached to the old page is cleanly invalidated.
    return {
      pages: [{ id: crypto.randomUUID(), objects: [] }],
      removedObjects,
    };
  }
  const next = pages.filter((_, i) => i !== index);
  return { pages: next, removedObjects };
};

/** Move the page at `from` to position `to`. Preserves each page's `id` and
 *  `background` so per-id state (command stacks, future per-page backgrounds)
 *  carries over the reorder. No-op for out-of-range indices. */
export const movePage = (
  pages: readonly DrawingPage[],
  from: number,
  to: number
): DrawingPage[] => {
  if (from < 0 || from >= pages.length) return [...pages];
  if (to < 0 || to >= pages.length) return [...pages];
  if (from === to) return [...pages];
  const next: DrawingPage[] = [...pages];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};
