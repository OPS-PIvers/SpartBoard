// The Quiz library's pinned, read-only District library folder and its mirror of the district folders.
import type { LibraryFolder } from '@/types';
import {
  childFolders,
  foldersWithItems,
  liveFolderId,
  type FolderMap,
} from '@/utils/districtLibraryFolders';

export const DISTRICT_SOURCE_FOLDER = 'source:district';

export const districtMirrorId = (folderId: string): string =>
  `${DISTRICT_SOURCE_FOLDER}:${folderId}`;

export const isDistrictSourceFolder = (
  id: string | null | undefined
): boolean =>
  id === DISTRICT_SOURCE_FOLDER ||
  (id ?? '').startsWith(`${DISTRICT_SOURCE_FOLDER}:`);

/** The pinned folder plus each district folder that holds one of `homes`, or nothing when `homes` is empty. */
export function districtSourceFolders(
  folders: FolderMap,
  homes: readonly (string | null | undefined)[]
): LibraryFolder[] {
  if (homes.length === 0) return [];
  const used = foldersWithItems(
    folders,
    homes.map((folderId) => ({ folderId: folderId ?? undefined }))
  );
  const out: LibraryFolder[] = [
    {
      id: DISTRICT_SOURCE_FOLDER,
      name: 'District library',
      parentId: null,
      order: Number.MIN_SAFE_INTEGER + 10,
      createdAt: 0,
      color: 'gray',
    },
  ];
  const walk = (parentId: string | null) => {
    for (const f of childFolders(folders, parentId)) {
      if (!used.has(f.id)) continue;
      out.push({
        id: districtMirrorId(f.id),
        name: f.name,
        parentId: parentId
          ? districtMirrorId(parentId)
          : DISTRICT_SOURCE_FOLDER,
        order: f.order,
        createdAt: 0,
        color: 'gray',
      });
      walk(f.id);
    }
  };
  walk(null);
  return out;
}

/** A district bank's place: the teacher's own folder when it still exists, else its district folder's mirror. */
export function districtBankFolderId(
  folders: FolderMap,
  home: string | null | undefined,
  ownFolderId: string | undefined,
  ownFolderIds: ReadonlySet<string>
): string {
  if (ownFolderId && ownFolderIds.has(ownFolderId)) return ownFolderId;
  const live = liveFolderId(folders, home);
  return live ? districtMirrorId(live) : DISTRICT_SOURCE_FOLDER;
}
