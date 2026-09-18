import { createContext, useContext } from 'react';
import type { Collection, Dashboard } from '@/types';

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

/** Boards the grid shows for a Collection view, in display order. */
export const boardsInView = (
  boards: Dashboard[],
  selectedCollectionId: string | null
): Dashboard[] =>
  (selectedCollectionId === null
    ? boards
    : boards.filter((b) => (b.collectionId ?? null) === selectedCollectionId)
  )
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/** Sibling Collections under `parentId`, in display order. At root, also includes orphans (parent id doesn't resolve) so they're reachable as grid cards for rename/move/delete, mirroring the sidebar tree's own orphan-surfacing. */
export const siblingCollections = (
  collections: Collection[],
  parentId: string | null
): Collection[] => {
  const knownIds = new Set(collections.map((c) => c.id));
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
