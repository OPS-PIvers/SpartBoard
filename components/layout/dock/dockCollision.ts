import {
  closestCenter,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core';

/** Folder-grouping hit test first, else closestCenter for reordering. */
export const createDockCollisionDetection =
  (folderIds: ReadonlySet<string>): CollisionDetection =>
  (args) => {
    // The dragged folder's own slot must not win, or it can't reorder past neighbors.
    const folderCollisions = rectIntersection(args).filter(
      (collision) =>
        folderIds.has(String(collision.id)) && collision.id !== args.active?.id
    );

    if (folderCollisions.length > 0) {
      folderCollisions.sort(
        (a, b) => (b.data?.value ?? 0) - (a.data?.value ?? 0)
      );
      return [folderCollisions[0]];
    }

    return closestCenter(args);
  };
