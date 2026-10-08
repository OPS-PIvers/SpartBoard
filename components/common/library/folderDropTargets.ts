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

/** Middle-of-row target that turns into "Create folder" after a hold (D14). */
export interface ItemMergeDropData {
  type: 'item-merge';
  itemId: string;
}

export const itemMergeDroppableId = (itemId: string): string =>
  `merge:${itemId}`;

/** Main-pane folder rows and path-bar levels (D12); distinct ids from the side tree's. */
export const folderRowDroppableId = (folderId: string): string =>
  `folder-row:${folderId}`;
export const crumbDroppableId = (folderId: string | null): string =>
  `crumb:${folderId ?? 'root'}`;

/** Share of a row's height, from each edge, that keeps reordering instead of merging. */
const MERGE_EDGE_FRACTION = 0.25;

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
  const mergeContainers = args.droppableContainers.filter((c) => {
    const data = c.data.current as ItemMergeDropData | undefined;
    return data?.type === 'item-merge';
  });
  const cardContainers = args.droppableContainers.filter((c) => {
    const data = c.data.current as
      | FolderDropData
      | ItemMergeDropData
      | undefined;
    return data?.type !== 'folder' && data?.type !== 'item-merge';
  });

  if (folderContainers.length > 0) {
    const pointerHits = pointerWithin({
      ...args,
      droppableContainers: folderContainers,
    });
    if (pointerHits.length > 0) return pointerHits;
    // Keyboard drags have no pointer, so the card's box picks the folder.
    if (!args.pointerCoordinates) {
      const rectHits = rectIntersection({
        ...args,
        droppableContainers: folderContainers,
      });
      if (rectHits.length > 0) return rectHits;
    }
  }

  const pointer = args.pointerCoordinates;
  if (pointer && mergeContainers.length > 0) {
    for (const container of mergeContainers) {
      const data = container.data.current as ItemMergeDropData;
      if (data.itemId === String(args.active.id)) continue;
      const rect = args.droppableRects.get(container.id);
      if (!rect) continue;
      if (
        pointer.x < rect.left ||
        pointer.x > rect.left + rect.width ||
        pointer.y < rect.top ||
        pointer.y > rect.top + rect.height
      ) {
        continue;
      }
      const edge = rect.height * MERGE_EDGE_FRACTION;
      if (
        pointer.y > rect.top + edge &&
        pointer.y < rect.top + rect.height - edge
      ) {
        return [{ id: container.id, data: { droppableContainer: container } }];
      }
      break;
    }
  }

  return closestCenter({ ...args, droppableContainers: cardContainers });
};
