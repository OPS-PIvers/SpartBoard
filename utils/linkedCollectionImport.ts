// Pure helpers for importing a Synced / View-Only shared collection (docs/plans/COLLECTION_SHARING.md slice 3).

import type {
  Dashboard,
  DashboardShareRole,
  LinkedCollection,
  LinkedCollectionBoard,
  LinkedCollectionSection,
  SharedBoardIntendedMode,
} from '@/types';

/** Recipient landing route for a Synced / View-Only collection link. */
export const LINKED_COLLECTION_SHARE_PREFIX = '/share/collection/';

/** The link id in a `/share/collection/{linkId}` path, or null. */
export const parseLinkedCollectionPath = (path: string): string | null => {
  if (!path.startsWith(LINKED_COLLECTION_SHARE_PREFIX)) return null;
  const id = path.slice(LINKED_COLLECTION_SHARE_PREFIX.length).split('/')[0];
  if (!id) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return null;
  }
};

/** Trust rule: a listed share is only imported when its own doc names this link and mode. */
export const sharedBoardBelongsToLink = (
  board: {
    linkedCollectionId?: string;
    intendedMode?: SharedBoardIntendedMode;
  },
  link: Pick<LinkedCollection, 'linkId' | 'mode'>
): boolean =>
  board.linkedCollectionId === link.linkId && board.intendedMode === link.mode;

const str = (value: unknown, max = 200): string | undefined =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : undefined;
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** A short CSS color or icon name from a collaborator-written field, else undefined. */
export const safeStyleValue = (value: unknown): string | undefined =>
  str(value, 50);

/** A non-empty display name, falling back when a collaborator wrote a blank or non-string one. */
export const safeName = (value: unknown, fallback: string): string =>
  str(value) ?? fallback;

/** Board entries narrowed to their typed fields, without duplicate share ids, in display order. */
export const uniqueLinkedBoards = (
  boards: unknown
): LinkedCollectionBoard[] => {
  if (!Array.isArray(boards)) return [];
  const seen = new Set<string>();
  const result: LinkedCollectionBoard[] = [];
  for (const raw of boards as Record<string, unknown>[]) {
    const shareId = str(raw?.shareId);
    if (!shareId || seen.has(shareId)) continue;
    seen.add(shareId);
    const sectionId = str(raw.sectionId);
    result.push({
      shareId,
      name: str(raw.name) ?? '',
      order: num(raw.order),
      ...(sectionId ? { sectionId } : {}),
    });
  }
  return result.sort((a, b) => a.order - b.order);
};

/** Sections ordered so every parent comes before its children; orphans and cycles land at the top level. */
export const orderSectionsParentsFirst = (
  sections: unknown
): LinkedCollectionSection[] => {
  if (!Array.isArray(sections)) return [];
  const byId = new Map<string, LinkedCollectionSection>();
  for (const raw of sections as Record<string, unknown>[]) {
    const id = str(raw?.id);
    if (!id || byId.has(id)) continue;
    const color = safeStyleValue(raw.color);
    byId.set(id, {
      id,
      name: str(raw.name) ?? '',
      parentId: str(raw.parentId) ?? null,
      order: num(raw.order),
      ...(color ? { color } : {}),
    });
  }
  const unique = [...byId.values()].sort((a, b) => a.order - b.order);

  const placed = new Set<string>();
  const result: LinkedCollectionSection[] = [];
  const place = (parentId: string | null) => {
    for (const s of unique) {
      if (placed.has(s.id) || s.parentId !== parentId) continue;
      placed.add(s.id);
      result.push(s);
      place(s.id);
    }
  };
  place(null);
  // Missing parents and cycles: re-root each unplaced section so nothing is dropped.
  for (const s of unique) {
    if (placed.has(s.id)) continue;
    placed.add(s.id);
    result.push({ ...s, parentId: null });
    place(s.id);
  }
  return result;
};

/** A local board mirroring one listed share, before `createNewDashboard` gives it an id. */
export const linkedBoardFromShare = (
  entry: LinkedCollectionBoard,
  snap: Dashboard & { originalAuthor?: string },
  opts: {
    uid: string;
    role: Exclude<DashboardShareRole, 'owner'>;
    fallbackName: string;
    order: number;
  }
): Dashboard => ({
  id: crypto.randomUUID(),
  name: safeName(entry.name, safeName(snap.name, opts.fallbackName)),
  background: snap.background,
  widgets: snap.widgets ?? [],
  globalStyle: snap.globalStyle,
  settings: snap.settings,
  isDefault: false,
  createdAt: Date.now(),
  order: opts.order,
  linkedShareId: entry.shareId,
  linkedShareRole: snap.originalAuthor === opts.uid ? 'owner' : opts.role,
  linkedShareHostName: snap.linkedShareHostName,
  linkedShareEnded: false,
});
