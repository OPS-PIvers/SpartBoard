// Folder browsers show one level at a time: its subfolders, then only the items filed directly in it.

/** Items at one level; null is the top level, which never lists filed items. Only search or a named smart view lists across folders. */
export function itemsAtFolderLevel<T>(
  items: readonly T[],
  levelId: string | null,
  folderOf: (item: T) => string | null
): T[] {
  return items.filter((item) => folderOf(item) === levelId);
}

/** Builds `folderOf` from an id field; an id that isn't a live folder counts as the top level. */
export const liveFolderOf =
  <T>(
    field: (item: T) => string | null | undefined,
    isLive: (id: string) => boolean
  ) =>
  (item: T): string | null => {
    const id = field(item);
    return id != null && isLive(id) ? id : null;
  };
