import { createContext, useContext } from 'react';
import type { Collection, Dashboard } from '@/types';
import { itemsAtFolderLevel, liveFolderOf } from '@/utils/folderLevel';

export type DropMode = 'before' | 'after' | 'into';

export interface DropIndicator {
  /** Droppable id, e.g. 'board:abc', 'collection:xyz' or 'tree:xyz'. */
  id: string;
  mode: DropMode;
}

export const DropIndicatorContext = createContext<DropIndicator | null>(null);

/** The drop mode currently shown on `droppableId`, or null. */
export const useDropMode = (droppableId: string): DropMode | null => {
  const indicator = useContext(DropIndicatorContext);
  return indicator?.id === droppableId ? indicator.mode : null;
};

/** Boards the grid shows: the open Collection's own, at the top level only uncollected ones, or every match while searching there. */
export const boardsInView = (
  boards: Dashboard[],
  selectedCollectionId: string | null,
  allCollections: Collection[],
  searchActive: boolean
): Dashboard[] => {
  const live = new Set(allCollections.map((c) => c.id));
  const shown =
    selectedCollectionId === null && searchActive
      ? boards
      : itemsAtFolderLevel(
          boards,
          selectedCollectionId,
          liveFolderOf(
            (b) => b.collectionId,
            (id) => live.has(id)
          )
        );
  return shown.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
};

/** Sibling Collections under `parentId`, in display order. At root, also includes orphans (parent id doesn't resolve) so they're reachable as grid cards for rename/move/delete, mirroring the sidebar tree's own orphan-surfacing. */
export const siblingCollections = (
  collections: Collection[],
  parentId: string | null,
  // Orphan detection must resolve parents against every Collection, or a search-filtered `collections` misreads a nested match whose parent was filtered out as an orphan.
  allCollections: Collection[] = collections
): Collection[] => {
  const knownIds = new Set(allCollections.map((c) => c.id));
  return collections
    .filter(
      (c) =>
        c.parentCollectionId === parentId ||
        (parentId === null &&
          c.parentCollectionId != null &&
          !knownIds.has(c.parentCollectionId))
    )
    .sort((a, b) => a.order - b.order);
};
