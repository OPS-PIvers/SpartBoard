import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import type { LibraryFolder } from '@/types';
import { filterByFolder, type HasFolderId } from './folderFilters';
import {
  ROOT_LOCATION,
  buildFolderIndex,
  effectiveFolderId,
  folderPath,
  folderPathLabel,
  folderTotals,
  formatFolderTotals,
  locationKey,
  parseLocationKey,
  pickRecent,
  sortFolders,
  subtreeFolderIds,
  type ItemNoun,
  type LibraryLocation,
} from './folderView';
import type { LibraryFolderViewModel } from './LibraryFolderViewContext';
import {
  readLastLibraryLocation,
  saveLastLibraryLocation,
} from './lastLibraryLocation';
import type { UseLibraryViewOptions, UseLibraryViewResult } from './types';
import { useLibraryView } from './useLibraryView';

export const LIBRARY_FOLDER_VIEW_FEATURE = 'library-folder-view';

const OUTSIDE_FOLDER_REASON = 'Open a folder to reorder.';

export interface FolderViewOptions<TItem> {
  /** Key for the last-folder preference, e.g. the folder widget id. */
  library: string;
  userId: string | undefined;
  folders: LibraryFolder[];
  foldersLoading: boolean;
  getId: (item: TItem) => string;
  /** Defaults to `item.folderId`. Return null for items that can't be filed. */
  getFolderId?: (item: TItem) => string | null | undefined;
  /** Defaults to `updatedAt ?? createdAt`. Pass the later of that and the last assign time. */
  getRecentAt?: (item: TItem) => number | null | undefined;
  itemNoun: ItemNoun;
  /** Legacy (flag off) folder filter; defaults to `filterByFolder`. */
  legacyFilter?: (items: TItem[], selectedFolderId: string | null) => TItem[];
  /** Overrides the feature flag (tests and fixtures). */
  enabled?: boolean;
}

export interface UseFolderLibraryViewResult<
  TItem,
> extends UseLibraryViewResult<TItem> {
  /** Null while the flag is off: callers render today's filter view. */
  folderView: LibraryFolderViewModel | null;
  /** Legacy selection, or the open folder in the folder view (null at the top level). */
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  /** Back to the top level without saving it as the last folder; safe to call during render. */
  resetToTopLevel: () => void;
}

const defaultFolderId = (item: unknown): string | null | undefined =>
  (item as HasFolderId).folderId;

const defaultRecentAt = (item: unknown): number | undefined => {
  const it = item as { updatedAt?: unknown; createdAt?: unknown };
  const updated = typeof it.updatedAt === 'number' ? it.updatedAt : undefined;
  const created = typeof it.createdAt === 'number' ? it.createdAt : undefined;
  return updated ?? created;
};

/** `useLibraryView` plus folder navigation (docs/plans/LIBRARY_FOLDERS.md D1-D10). */
export function useFolderLibraryView<TItem>(
  options: UseLibraryViewOptions<TItem> & {
    folderView: FolderViewOptions<TItem>;
  }
): UseFolderLibraryViewResult<TItem> {
  const { folderView: fv, items, ...viewOptions } = options;
  const {
    library,
    userId,
    folders,
    foldersLoading,
    getId,
    itemNoun,
    getFolderId = defaultFolderId,
    getRecentAt = defaultRecentAt,
    legacyFilter = filterByFolder as (
      list: TItem[],
      selected: string | null
    ) => TItem[],
  } = fv;
  const auth = useContext(AuthContext);
  const enabled =
    fv.enabled ?? auth?.canAccessFeature(LIBRARY_FOLDER_VIEW_FEATURE) ?? false;

  const [legacySelected, setLegacySelected] = useState<string | null>(null);
  const [location, setLocation] = useState<LibraryLocation>(ROOT_LOCATION);
  const [searchScope, setSearchScope] = useState<'folder' | 'all'>('folder');
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const [navigated, setNavigated] = useState(false);
  // Recent's 30-day window is measured from when the library opened.
  const [openedAt] = useState(() => Date.now());

  const index = useMemo(() => buildFolderIndex(folders), [folders]);

  // Reset when the signed-in teacher changes.
  const [prevUserId, setPrevUserId] = useState(userId);
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    setLegacySelected(null);
    setLocation(ROOT_LOCATION);
    setPendingRestore(null);
    setNavigated(false);
  }

  useEffect(() => {
    if (!enabled || !userId) return undefined;
    let live = true;
    void readLastLibraryLocation(userId, library).then((key) => {
      if (live && key) setPendingRestore(key);
    });
    return () => {
      live = false;
    };
  }, [enabled, userId, library]);

  if (pendingRestore != null && !foldersLoading) {
    setPendingRestore(null);
    const restored = parseLocationKey(pendingRestore);
    if (
      !navigated &&
      (restored.kind !== 'folder' ||
        restored.folderId == null ||
        index.byId.has(restored.folderId))
    ) {
      setLocation(restored);
    }
  }

  // A deleted folder drops the view back to the top level.
  if (
    !foldersLoading &&
    location.kind === 'folder' &&
    location.folderId != null &&
    !index.byId.has(location.folderId)
  ) {
    setLocation(ROOT_LOCATION);
  }
  if (
    !foldersLoading &&
    legacySelected != null &&
    !index.byId.has(legacySelected)
  ) {
    setLegacySelected(null);
  }

  const navigate = useCallback(
    (next: LibraryLocation) => {
      setNavigated(true);
      setLocation(next);
      setSearchScope('folder');
      if (userId) saveLastLibraryLocation(userId, library, locationKey(next));
    },
    [userId, library]
  );

  const itemFolderId = useCallback(
    (item: TItem) => effectiveFolderId(getFolderId(item), index),
    [getFolderId, index]
  );

  const recentRank = useMemo(() => {
    if (!enabled || location.kind !== 'recent') return null;
    const rank = new Map<string, number>();
    pickRecent(items, getRecentAt, openedAt).forEach((item, i) =>
      rank.set(getId(item), i)
    );
    return rank;
  }, [enabled, location.kind, items, getRecentAt, getId, openedAt]);

  const openFolderId = location.kind === 'folder' ? location.folderId : null;
  const subtree = useMemo(
    () =>
      enabled && location.kind === 'folder' && searchScope === 'folder'
        ? subtreeFolderIds(openFolderId, index)
        : null,
    [enabled, location.kind, searchScope, openFolderId, index]
  );

  const pool = useMemo(() => {
    if (!enabled) return legacyFilter(items, legacySelected);
    if (recentRank) return items.filter((item) => recentRank.has(getId(item)));
    if (subtree) return items.filter((item) => subtree.has(itemFolderId(item)));
    return items;
  }, [
    enabled,
    legacyFilter,
    items,
    legacySelected,
    recentRank,
    subtree,
    getId,
    itemFolderId,
  ]);

  const view = useLibraryView<TItem>({ ...viewOptions, items: pool });
  const searchActive = view.state.search.trim() !== '';

  if (!searchActive && searchScope !== 'folder') setSearchScope('folder');

  const visibleItems = useMemo(() => {
    if (!enabled) return view.visibleItems;
    if (recentRank) {
      return [...view.visibleItems].sort(
        (a, b) =>
          (recentRank.get(getId(a)) ?? 0) - (recentRank.get(getId(b)) ?? 0)
      );
    }
    if (location.kind === 'folder' && !searchActive) {
      return view.visibleItems.filter(
        (item) => itemFolderId(item) === openFolderId
      );
    }
    return view.visibleItems;
  }, [
    enabled,
    view.visibleItems,
    recentRank,
    location.kind,
    searchActive,
    getId,
    itemFolderId,
    openFolderId,
  ]);

  const totals = useMemo(
    () => folderTotals(index, items.map(itemFolderId)),
    [index, items, itemFolderId]
  );

  const folderIdById = useMemo(() => {
    const map = new Map<string, string | null>();
    if (enabled)
      for (const item of items) map.set(getId(item), itemFolderId(item));
    return map;
  }, [enabled, items, getId, itemFolderId]);

  const sort = view.state.sort;
  const folderView = useMemo<LibraryFolderViewModel | null>(() => {
    if (!enabled) return null;
    const showRows = location.kind === 'folder' && !searchActive;
    const folderRows = showRows
      ? sortFolders(index.childrenOf.get(openFolderId) ?? [], sort).map(
          (folder) => ({
            folder,
            label: formatFolderTotals(
              totals.get(folder.id) ?? { folders: 0, items: 0 },
              itemNoun
            ),
          })
        )
      : [];
    const pathByItemId = new Map<string, string>();
    if (location.kind !== 'folder' || searchActive) {
      for (const item of visibleItems) {
        const folderId = itemFolderId(item);
        if (folderId == null || folderId === openFolderId) continue;
        pathByItemId.set(
          getId(item),
          folderPathLabel(folderPath(folderId, index))
        );
      }
    }
    return {
      location,
      navigate,
      index,
      totals,
      folderRows,
      itemNoun,
      searchActive,
      searchScope,
      setSearchScope,
      pathByItemId,
      folderIdOf: (itemId) => folderIdById.get(itemId) ?? null,
      emptyFolder:
        showRows &&
        openFolderId != null &&
        folderRows.length === 0 &&
        visibleItems.length === 0,
    };
  }, [
    enabled,
    location,
    searchActive,
    index,
    openFolderId,
    sort,
    totals,
    itemNoun,
    visibleItems,
    itemFolderId,
    getId,
    navigate,
    searchScope,
    folderIdById,
  ]);

  const resetToTopLevel = useCallback(() => {
    setLegacySelected(null);
    setLocation(ROOT_LOCATION);
  }, []);

  const outsideFolder = enabled && location.kind !== 'folder';
  const onSelectFolder = useCallback(
    (folderId: string | null) => {
      if (enabled) navigate({ kind: 'folder', folderId });
      else setLegacySelected(folderId);
    },
    [enabled, navigate]
  );

  return {
    ...view,
    visibleItems,
    reorderLocked: view.reorderLocked || outsideFolder,
    reorderLockedReason:
      view.reorderLockedReason ??
      (outsideFolder ? OUTSIDE_FOLDER_REASON : undefined),
    prepareReorder: outsideFolder ? () => false : view.prepareReorder,
    folderView,
    selectedFolderId: enabled ? openFolderId : legacySelected,
    onSelectFolder,
    resetToTopLevel,
  };
}
