// Source folders and private filing for items the teacher doesn't own (LIBRARY_FOLDERS D21-D24).
import { useCallback, useMemo } from 'react';
import type { LibraryFolder } from '@/types';
import {
  placementSourceOf,
  useLibraryPlacements,
  type PlacementSource,
  type PlacementWidget,
} from '@/hooks/useLibraryPlacements';
import {
  SOURCE_LABELS,
  SOURCE_ORDER,
  isSourceFolderId,
  sourceFolder,
  sourceFolderId,
} from './sourceFolders';

export interface SourceFoldersOptions {
  userId: string | undefined;
  widget: PlacementWidget;
  /** The folder view flag; off = no source folders and no placements. */
  enabled: boolean;
  /** Source keys of every item the teacher can see but doesn't own. */
  sourceKeys: readonly string[];
  ownFolders: LibraryFolder[];
}

export interface PlacedItem {
  folderId: string;
  source: PlacementSource;
}

export interface SourceFolders {
  /** Own folders plus a pinned folder per source that has items. */
  folders: LibraryFolder[];
  /** The teacher's folder for a source item, else its source folder. */
  folderIdOf: (sourceKey: string) => string;
  /** The chip label for a source item filed in one of the teacher's folders. */
  placedChip: (sourceKey: string) => string | null;
  /** Files a source item; null or its source folder returns it there. */
  move: (sourceKey: string, folderId: string | null) => Promise<void>;
  /** Source items filed in the teacher's folders, for the folder delete dialog. */
  placed: PlacedItem[];
}

export function useSourceFolders({
  userId,
  widget,
  enabled,
  sourceKeys,
  ownFolders,
}: SourceFoldersOptions): SourceFolders {
  const placements = useLibraryPlacements(userId, enabled ? widget : null);
  const { byKey, place, unplace } = placements;

  const ownIds = useMemo(
    () => new Set(ownFolders.map((f) => f.id)),
    [ownFolders]
  );

  const folders = useMemo(() => {
    if (!enabled) return ownFolders;
    const present = new Set<PlacementSource>();
    for (const key of sourceKeys) {
      const source = placementSourceOf(key);
      if (source) present.add(source);
    }
    const pinned = SOURCE_ORDER.filter((s) => present.has(s)).map(sourceFolder);
    return pinned.length > 0 ? [...pinned, ...ownFolders] : ownFolders;
  }, [enabled, sourceKeys, ownFolders]);

  const filedFolderOf = useCallback(
    (sourceKey: string): string | null => {
      const folderId = byKey.get(sourceKey)?.folderId;
      return folderId != null && ownIds.has(folderId) ? folderId : null;
    },
    [byKey, ownIds]
  );

  const folderIdOf = useCallback(
    (sourceKey: string): string =>
      filedFolderOf(sourceKey) ??
      sourceFolderId(placementSourceOf(sourceKey) ?? 'building'),
    [filedFolderOf]
  );

  const placedChip = useCallback(
    (sourceKey: string): string | null => {
      if (!enabled || filedFolderOf(sourceKey) == null) return null;
      const source = placementSourceOf(sourceKey);
      return source ? SOURCE_LABELS[source].chip : null;
    },
    [enabled, filedFolderOf]
  );

  const move = useCallback(
    async (sourceKey: string, folderId: string | null): Promise<void> => {
      if (folderId == null || isSourceFolderId(folderId)) {
        if (byKey.has(sourceKey)) await unplace(sourceKey);
        return;
      }
      await place(sourceKey, folderId);
    },
    [byKey, place, unplace]
  );

  const placed = useMemo(() => {
    const out: PlacedItem[] = [];
    for (const key of sourceKeys) {
      const folderId = filedFolderOf(key);
      const source = placementSourceOf(key);
      if (folderId != null && source) out.push({ folderId, source });
    }
    return out;
  }, [sourceKeys, filedFolderOf]);

  // No cleanup of orphaned placements: a partial source list would delete live filings.
  return useMemo(
    () => ({ folders, folderIdOf, placedChip, move, placed }),
    [folders, folderIdOf, placedChip, move, placed]
  );
}
