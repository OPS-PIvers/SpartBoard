/**
 * folderDropTargets — shared helpers + types for folder drag/drop wiring.
 *
 * Extracted out of `LibraryDndContext.tsx` so the context file exports only a
 * React component (required by the `react-refresh/only-export-components`
 * lint rule to keep Fast Refresh happy in dev).
 */

import {
  closestCenter,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core';

/** Data attached to folder droppables via `useDroppable({ data: {...} })`. */
export interface FolderDropData {
  type: 'folder';
  /** `null` means the "All items" root drop zone. */
  folderId: string | null;
}

/**
 * Droppable id prefix for folder drop targets. Prefixing keeps folder ids
 * from ever colliding with sortable card ids in the same DndContext.
 */
export const FOLDER_DROPPABLE_PREFIX = 'folder:';

/** Build the droppable id for a given folder (null = root). */
export const folderDroppableId = (folderId: string | null): string =>
  `${FOLDER_DROPPABLE_PREFIX}${folderId ?? 'root'}`;

/**
 * Collision detection that prioritizes folder droppables over card droppables.
 *
 * When the user drags a card over the FolderSidebar, dnd-kit's default
 * `closestCenter` picks whichever drop target has the closest centroid — and
 * the next card in the grid is almost always closer than a sidebar folder row.
 * This means drops land back on the grid (as reorder) instead of on the folder
 * (as a move). That's the bug behind "drag-to-folder doesn't work".
 *
 * Strategy:
 *   1. First try `pointerWithin` against folder droppables only — if the
 *      pointer is directly over a folder row, commit to that folder.
 *   2. If the pointer isn't over any folder but the drag *rect* intersects
 *      one, fall back to `rectIntersection` against folders — covers drags
 *      where the ghost card overlaps the sidebar while the pointer is still
 *      on the grid side of the edge.
 *   3. Otherwise, run `closestCenter` against the card droppables for normal
 *      reorder behavior.
 */
export const folderAwareCollisionDetection: CollisionDetection = (args) => {
  const folderContainers = args.droppableContainers.filter((c) => {
    const data = c.data.current as FolderDropData | undefined;
    return data?.type === 'folder';
  });
  const cardContainers = args.droppableContainers.filter((c) => {
    const data = c.data.current as FolderDropData | undefined;
    return data?.type !== 'folder';
  });

  if (folderContainers.length > 0) {
    const pointerHits = pointerWithin({
      ...args,
      droppableContainers: folderContainers,
    });
    if (pointerHits.length > 0) return pointerHits;

    const rectHits = rectIntersection({
      ...args,
      droppableContainers: folderContainers,
    });
    if (rectHits.length > 0) return rectHits;
  }

  return closestCenter({ ...args, droppableContainers: cardContainers });
};
