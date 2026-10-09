import type { LibraryFolderViewModel } from '@/components/common/library';
import { subtreeFolderIds } from '@/components/common/library/folderView';

type FolderViewSlice = Pick<
  LibraryFolderViewModel,
  'location' | 'index' | 'searchActive' | 'searchScope'
>;

// Teammates' banks shown in the folder view: All items, search matches, or the open folder's.
export function visibleTeammateBanks<T extends { key: string; title: string }>(
  banks: T[],
  folderView: FolderViewSlice | null,
  search: string,
  folderIdOf: (key: string) => string | null
): T[] {
  if (!folderView) return [];
  const { location } = folderView;
  if (folderView.searchActive) {
    const query = search.trim().toLowerCase();
    const scope =
      location.kind === 'folder' && folderView.searchScope === 'folder'
        ? subtreeFolderIds(location.folderId, folderView.index)
        : null;
    return banks.filter(
      (b) =>
        b.title.toLowerCase().includes(query) &&
        (!scope || scope.has(folderIdOf(b.key)))
    );
  }
  if (location.kind === 'all') return banks;
  if (location.kind !== 'folder') return [];
  return banks.filter((b) => folderIdOf(b.key) === location.folderId);
}
