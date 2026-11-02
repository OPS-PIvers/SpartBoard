import {
  closestCenter,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core';

/** Folder-grouping hit test first, else closestCenter for reordering. */
export const createDockCollisionDetection =
  (folderIds: ReadonlySet<string>): CollisionDetection =>
  (args) => {
    // Folders never group into folders, so a dragged folder only reorders.
    if (folderIds.has(String(args.active.id))) return closestCenter(args);
    const folderCollisions = rectIntersection(args).filter((collision) =>
      folderIds.has(String(collision.id))
    );

    if (folderCollisions.length > 0) {
      folderCollisions.sort(
        (a, b) => (b.data?.value ?? 0) - (a.data?.value ?? 0)
      );
      return [folderCollisions[0]];
    }

    return closestCenter(args);
  };
