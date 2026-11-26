// Board collections shown through the shared library folder pieces (move picker, delete dialog, colour row).
import type { Collection, Dashboard, LibraryFolder } from '@/types';
import type { LibraryItemNoun } from '@/components/common/library/DeleteFolderDialog';
import {
  collectionPaletteHex,
  folderColorSwatch,
} from '@/components/common/library/folderColors';
import { collectDescendantIds } from '@/utils/folderTree';

export const BOARD_NOUN: LibraryItemNoun = { one: 'board', many: 'boards' };

export const collectionAsFolder = (c: Collection): LibraryFolder => {
  const color = folderColorSwatch(c.color)?.id;
  return {
    id: c.id,
    name: c.name,
    parentId: c.parentCollectionId,
    order: c.order,
    createdAt: c.createdAt,
    ...(color ? { color } : {}),
  };
};

/** Subcollections at any depth, and boards in the collection or any of them. */
export const collectionDeleteCounts = (
  collectionId: string,
  collections: readonly Collection[],
  boards: readonly Dashboard[]
): { subfolderCount: number; itemCount: number } => {
  const below = collectDescendantIds(
    collectionId,
    collections,
    (c) => c.parentCollectionId
  );
  const ids = new Set([collectionId, ...below]);
  return {
    subfolderCount: below.length,
    itemCount: boards.filter(
      (b) => b.collectionId != null && ids.has(b.collectionId)
    ).length,
  };
};

/** A stored collection with its colour mapped onto the shared folder palette (read-time only, nothing is rewritten). */
export const withPaletteColor = (c: Collection): Collection => {
  const out: Collection = { ...c };
  const color = collectionPaletteHex(c.color);
  if (color) out.color = color;
  else delete out.color;
  return out;
};
