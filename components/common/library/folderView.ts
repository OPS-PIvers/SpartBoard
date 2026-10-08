// Pure helpers for the folder view (docs/plans/LIBRARY_FOLDERS.md D1-D10).
import type { LibraryFolder } from '@/types';
import type { LibrarySortDir } from './types';

export type LibraryLocation =
  | { kind: 'folder'; folderId: string | null }
  | { kind: 'all' }
  | { kind: 'recent' };

export const ROOT_LOCATION: LibraryLocation = {
  kind: 'folder',
  folderId: null,
};

export const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const RECENT_LIMIT = 25;

/** Breadcrumbs longer than this collapse their middle levels into "…". */
/** Name given to a folder made by holding one item over another (D14). */
export const NEW_FOLDER_NAME = 'New folder';
export const BREADCRUMB_MAX_LEVELS = 3;

export type ItemNoun = readonly [one: string, other: string];

export interface FolderIndex {
  byId: Map<string, LibraryFolder>;
  childrenOf: Map<string | null, LibraryFolder[]>;
}

export function buildFolderIndex(folders: LibraryFolder[]): FolderIndex {
  const byId = new Map<string, LibraryFolder>();
  for (const f of folders) byId.set(f.id, f);
  const childrenOf = new Map<string | null, LibraryFolder[]>();
  for (const f of folders) {
    // A folder whose parent vanished is treated as top level so it stays reachable.
    const parent =
      f.parentId != null && byId.has(f.parentId) ? f.parentId : null;
    const bucket = childrenOf.get(parent);
    if (bucket) bucket.push(f);
    else childrenOf.set(parent, [f]);
  }
  return { byId, childrenOf };
}

/** Folders from the top level down to `folderId`, inclusive. Cycle-safe. */
export function folderPath(
  folderId: string | null,
  index: FolderIndex
): LibraryFolder[] {
  const path: LibraryFolder[] = [];
  const seen = new Set<string>();
  let cursor = folderId;
  while (cursor != null && !seen.has(cursor)) {
    seen.add(cursor);
    const folder = index.byId.get(cursor);
    if (!folder) break;
    path.unshift(folder);
    cursor = folder.parentId;
  }
  return path;
}

/** `folderId` plus every folder beneath it. `null` = the whole library. */
export function subtreeFolderIds(
  folderId: string | null,
  index: FolderIndex
): Set<string | null> {
  const ids = new Set<string | null>([folderId]);
  const stack = [folderId];
  while (stack.length > 0) {
    const id = stack.pop() ?? null;
    for (const child of index.childrenOf.get(id) ?? []) {
      if (ids.has(child.id)) continue;
      ids.add(child.id);
      stack.push(child.id);
    }
  }
  return ids;
}

/** Resolves an item's folder, treating ids of deleted folders as top level. */
export function effectiveFolderId(
  folderId: string | null | undefined,
  index: FolderIndex
): string | null {
  return folderId != null && index.byId.has(folderId) ? folderId : null;
}

export interface FolderTotals {
  folders: number;
  items: number;
}

/** Recursive subfolder and item totals for every folder (D10). */
export function folderTotals(
  index: FolderIndex,
  itemFolderIds: (string | null)[]
): Map<string, FolderTotals> {
  const direct = new Map<string, number>();
  for (const id of itemFolderIds) {
    if (id != null) direct.set(id, (direct.get(id) ?? 0) + 1);
  }
  const totals = new Map<string, FolderTotals>();
  const visiting = new Set<string>();
  const visit = (folder: LibraryFolder): FolderTotals => {
    const cached = totals.get(folder.id);
    if (cached) return cached;
    if (visiting.has(folder.id)) return { folders: 0, items: 0 };
    visiting.add(folder.id);
    let folders = 0;
    let items = direct.get(folder.id) ?? 0;
    for (const child of index.childrenOf.get(folder.id) ?? []) {
      const sub = visit(child);
      folders += 1 + sub.folders;
      items += sub.items;
    }
    const result = { folders, items };
    totals.set(folder.id, result);
    return result;
  };
  for (const folder of index.byId.values()) visit(folder);
  return totals;
}

const plural = (n: number, noun: ItemNoun): string =>
  `${n} ${n === 1 ? noun[0] : noun[1]}`;

/** "12 sets", "2 folders · 12 sets", or "Empty". */
export function formatFolderTotals(
  totals: FolderTotals,
  noun: ItemNoun
): string {
  const parts: string[] = [];
  if (totals.folders > 0)
    parts.push(plural(totals.folders, ['folder', 'folders']));
  if (totals.items > 0 || totals.folders > 0)
    parts.push(plural(totals.items, noun));
  return parts.length === 0 ? 'Empty' : parts.join(' · ');
}

const NAME_SORT_KEYS = new Set(['title', 'name']);
const DATE_SORT_KEYS = new Set([
  'updated',
  'updatedAt',
  'created',
  'createdAt',
  'recent',
]);

const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/** Folders follow the active item sort: name, last change, or manual order (D8). */
export function sortFolders(
  folders: LibraryFolder[],
  sort: { key: string; dir: LibrarySortDir }
): LibraryFolder[] {
  const sign = sort.dir === 'desc' ? -1 : 1;
  const copy = [...folders];
  if (NAME_SORT_KEYS.has(sort.key)) {
    return copy.sort((a, b) => sign * nameCollator.compare(a.name, b.name));
  }
  if (DATE_SORT_KEYS.has(sort.key)) {
    return copy.sort(
      (a, b) =>
        sign * ((a.updatedAt ?? a.createdAt) - (b.updatedAt ?? b.createdAt))
    );
  }
  return copy.sort((a, b) => a.order - b.order);
}

export type BreadcrumbEntry =
  | { kind: 'root' }
  | { kind: 'folder'; folder: LibraryFolder }
  | { kind: 'gap'; hidden: LibraryFolder[] };

/** `Library › … › Unit 3 › Week 2` (D3). */
export function breadcrumbEntries(path: LibraryFolder[]): BreadcrumbEntry[] {
  const entries: BreadcrumbEntry[] = [{ kind: 'root' }];
  if (path.length <= BREADCRUMB_MAX_LEVELS) {
    for (const folder of path) entries.push({ kind: 'folder', folder });
    return entries;
  }
  const keep = BREADCRUMB_MAX_LEVELS - 1;
  entries.push({ kind: 'gap', hidden: path.slice(0, path.length - keep) });
  for (const folder of path.slice(path.length - keep)) {
    entries.push({ kind: 'folder', folder });
  }
  return entries;
}

export function folderPathLabel(path: LibraryFolder[]): string {
  return path.map((f) => f.name).join(' › ');
}

/** Edited or assigned in the last 30 days, newest first, capped (D6). */
export function pickRecent<T>(
  items: T[],
  recentAt: (item: T) => number | null | undefined,
  now: number
): T[] {
  const cutoff = now - RECENT_WINDOW_MS;
  return items
    .map((item) => ({ item, at: recentAt(item) ?? 0 }))
    .filter((entry) => entry.at >= cutoff)
    .sort((a, b) => b.at - a.at)
    .slice(0, RECENT_LIMIT)
    .map((entry) => entry.item);
}

/** Serialises a location for the last-folder preference. */
export function locationKey(location: LibraryLocation): string {
  if (location.kind === 'folder') return location.folderId ?? 'root';
  return `:${location.kind}`;
}

export function parseLocationKey(
  key: string | null | undefined
): LibraryLocation {
  if (key == null || key === 'root' || key === '') return ROOT_LOCATION;
  if (key === ':all') return { kind: 'all' };
  if (key === ':recent') return { kind: 'recent' };
  return { kind: 'folder', folderId: key };
}

export function sameLocation(a: LibraryLocation, b: LibraryLocation): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'folder' && b.kind === 'folder')
    return a.folderId === b.folderId;
  return true;
}

/** Latest assign time per item id, for the Recent view (D6). */
export function latestAssignedAt<A extends { createdAt?: number }>(
  assignments: A[],
  itemId: (assignment: A) => string | null | undefined
): Map<string, number> {
  const latest = new Map<string, number>();
  for (const a of assignments) {
    const id = itemId(a);
    if (!id || typeof a.createdAt !== 'number') continue;
    if (a.createdAt > (latest.get(id) ?? 0)) latest.set(id, a.createdAt);
  }
  return latest;
}
