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
 * A folder only wins while the pointer is over it; otherwise `closestCenter`
 * picks the card slot, so rows keep making room while the dragged card's box
 * overlaps the sidebar.
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
  }

  return closestCenter({ ...args, droppableContainers: cardContainers });
};
