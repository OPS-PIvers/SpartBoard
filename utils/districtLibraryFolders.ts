// District library folders: tree helpers shared by the admin panel, the teacher dialog and the Quiz library.
import type {
  DistrictLibraryFolder,
  DistrictLibraryFolderAudiences,
  DistrictLibraryItem,
  DistrictLibraryTargeting,
} from '@/types/districtLibrary';

export const DISTRICT_FOLDERS_DOC = 'folders';
export const DISTRICT_AUDIENCES_DOC = 'audiences';

export type FolderMap = Readonly<Record<string, DistrictLibraryFolder>>;
export type FolderAudience = DistrictLibraryTargeting & {
  gradeBuildings: string[];
};

export interface FolderNode extends DistrictLibraryFolder {
  id: string;
}

/** A folder id that still exists, else null (the top level). */
export const liveFolderId = (
  folders: FolderMap,
  id: string | null | undefined
): string | null => (id && folders[id] ? id : null);

/** Child folders in display order. */
export function childFolders(
  folders: FolderMap,
  parentId: string | null
): FolderNode[] {
  return Object.entries(folders)
    .filter(([, f]) => liveFolderId(folders, f.parentId) === parentId)
    .map(([id, f]) => ({ ...f, id }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** Root-first chain of folders down to `id`. Stops on a cycle. */
export function folderChain(
  folders: FolderMap,
  id: string | null
): FolderNode[] {
  const out: FolderNode[] = [];
  const seen = new Set<string>();
  let cur = liveFolderId(folders, id);
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.unshift({ ...folders[cur], id: cur });
    cur = liveFolderId(folders, folders[cur].parentId);
  }
  return out;
}

export const folderPathLabel = (folders: FolderMap, id: string | null) =>
  folderChain(folders, id)
    .map((f) => f.name)
    .join(' / ');

/** True when `id` is `rootId` or sits somewhere under it. */
export const isInFolder = (
  folders: FolderMap,
  id: string | null | undefined,
  rootId: string
): boolean => folderChain(folders, id ?? null).some((f) => f.id === rootId);

/** True when moving `folderId` under `parentId` would put it inside itself. */
export const wouldNestInSelf = (
  folders: FolderMap,
  folderId: string,
  parentId: string | null
): boolean => parentId !== null && isInFolder(folders, parentId, folderId);

/** The item's folder, or null when it is at the top level or its folder was deleted. */
export const itemFolderId = (
  folders: FolderMap,
  item: Pick<DistrictLibraryItem, 'folderId'>
): string | null => liveFolderId(folders, item.folderId);

/** The nearest folder from `folderId` up that has an audience. */
export function folderAudienceFor(
  folders: FolderMap,
  audiences: DistrictLibraryFolderAudiences['folders'],
  folderId: string | null
): { folderId: string; audience: FolderAudience } | null {
  const chain = folderChain(folders, folderId);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const audience = audiences[chain[i].id];
    if (audience) return { folderId: chain[i].id, audience };
  }
  return null;
}

/** True when the item follows its folder's audience. */
export const followsFolder = (
  folders: FolderMap,
  item: Pick<DistrictLibraryItem, 'folderId' | 'ownTargeting'>
): boolean => !item.ownTargeting && itemFolderId(folders, item) !== null;

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

export const sameAudience = (
  a: FolderAudience,
  b: DistrictLibraryTargeting & { gradeBuildings: readonly string[] }
): boolean =>
  a.everyone === b.everyone &&
  sameList(a.targetBuildings, b.targetBuildings) &&
  sameList(a.targetGrades, b.targetGrades) &&
  sameList(a.targetEmails, b.targetEmails) &&
  sameList(a.gradeBuildings, b.gradeBuildings);

/** Items that follow their folder but don't yet carry that folder's audience. */
export function itemsNeedingFolderAudience(
  items: readonly DistrictLibraryItem[],
  folders: FolderMap,
  audiences: DistrictLibraryFolderAudiences['folders']
): { item: DistrictLibraryItem; audience: FolderAudience }[] {
  const out: { item: DistrictLibraryItem; audience: FolderAudience }[] = [];
  for (const item of items) {
    if (!followsFolder(folders, item)) continue;
    const found = folderAudienceFor(folders, audiences, item.folderId ?? null);
    if (found && !sameAudience(found.audience, item)) {
      out.push({ item, audience: found.audience });
    }
  }
  return out;
}

/** Inside a folder, drop the series prefix a title repeats ("MCA IV Science Grade 8: Light Bulbs" reads "Light Bulbs"). */
export function shortTitle(title: string): string {
  const at = title.indexOf(': ');
  if (at <= 0) return title;
  const rest = title.slice(at + 2).trim();
  return rest || title;
}

/** Folders that hold at least one of `items` somewhere inside them. */
export function foldersWithItems(
  folders: FolderMap,
  items: readonly Pick<DistrictLibraryItem, 'folderId'>[]
): Set<string> {
  const out = new Set<string>();
  for (const item of items) {
    for (const f of folderChain(folders, item.folderId ?? null)) out.add(f.id);
  }
  return out;
}

/** Where the teacher dialog opens: the one folder holding every visible item when no other folder or top-level item competes, else the top. */
export function startingFolder(
  folders: FolderMap,
  items: readonly Pick<DistrictLibraryItem, 'folderId'>[]
): string | null {
  if (items.length === 0) return null;
  const homes = new Set(items.map((i) => liveFolderId(folders, i.folderId)));
  if (homes.size !== 1) return null;
  const [only] = [...homes];
  return only;
}

/** Next sibling order for a new folder under `parentId`. */
export const nextFolderOrder = (
  folders: FolderMap,
  parentId: string | null
): number =>
  childFolders(folders, parentId).reduce(
    (max, f) => Math.max(max, f.order),
    -1
  ) + 1;
