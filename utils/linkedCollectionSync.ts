// Pure planning for Synced / View-Only collection membership sync (docs/plans/COLLECTION_SHARING.md slice 4).

import { collectDescendantIds } from '@/utils/folderTree';
import {
  orderSectionsParentsFirst,
  safeName,
  safeStyleValue,
  uniqueLinkedBoards,
} from '@/utils/linkedCollectionImport';
import type {
  Collection,
  Dashboard,
  LinkedCollection,
  LinkedCollectionBoard,
  LinkedCollectionSection,
} from '@/types';

/** The section id a local collection stands for: imported ones carry `linkedSectionId`, the host's are their own id. */
export const sectionKey = (c: Collection): string => c.linkedSectionId ?? c.id;

export const isLiveLinkedRoot = (c: Collection): boolean =>
  !!c.linkedCollectionId && !c.linkedCollectionEnded;

/** A board that is mirroring a share right now. */
export const liveShareIdOf = (d: Dashboard): string | undefined =>
  d.linkedShareId && !d.linkedShareEnded ? d.linkedShareId : undefined;

/** Local id of the board mirroring a listed share: the same in every tab, so two tabs import it once. */
export const linkedBoardLocalId = (shareId: string): string =>
  `linked-${shareId}`;

/** Share id for a board in a shared collection: the same in every tab, so two tabs share it once. */
export const linkedBoardShareId = (linkId: string, boardId: string): string =>
  `${linkId}_${boardId}`;

/** True when the board's own id ties it to that share, so it is safe to remove with the share gone. */
export const boardBelongsToShare = (
  board: Pick<Dashboard, 'id'>,
  shareId: string,
  linkId: string
): boolean =>
  board.id === linkedBoardLocalId(shareId) ||
  shareId === linkedBoardShareId(linkId, board.id);

/** The live linked collections this teacher has. */
export const liveLinkedRoots = (collections: Collection[]): Collection[] =>
  collections.filter(isLiveLinkedRoot);

/** A linked collection and every sub-collection under it. */
export const collectionTreeIds = (
  rootId: string,
  collections: Collection[]
): Set<string> =>
  new Set([
    rootId,
    ...collectDescendantIds(rootId, collections, (c) => c.parentCollectionId),
  ]);

/** Every collection inside a live linked collection; boards in these listen only while open (D3). */
export const linkedTreeCollectionIds = (
  collections: Collection[]
): Set<string> => {
  const ids = new Set<string>();
  for (const root of liveLinkedRoots(collections)) {
    for (const id of collectionTreeIds(root.id, collections)) ids.add(id);
  }
  return ids;
};

/** True when this teacher may add, remove or rename things in the shared collection (D2). */
export const canEditLinkedCollection = (
  link: Pick<LinkedCollection, 'hostUid' | 'mode' | 'participants' | 'ended'>,
  uid: string
): boolean =>
  !link.ended &&
  (link.hostUid === uid ||
    (link.mode === 'synced' &&
      link.participants?.[uid]?.role === 'collaborator'));

/** True while this teacher still belongs to the link (host or a current member). */
export const isLinkMember = (
  link: Pick<LinkedCollection, 'hostUid' | 'participants'>,
  uid: string
): boolean => link.hostUid === uid || !!link.participants?.[uid];

export interface RemoteSyncPlan {
  /** Root collection look to take from the link, or null when it already matches. */
  metadata: Partial<Pick<Collection, 'name' | 'color' | 'icon'>> | null;
  /** Sections with no local sub-collection yet, parents first. */
  createSections: LinkedCollectionSection[];
  /** Local sub-collections whose name or color differs from the link. */
  updateSections: {
    collectionId: string;
    patch: Partial<Pick<Collection, 'name' | 'color'>>;
  }[];
  /** Listed boards with no live local copy anywhere. */
  missingEntries: LinkedCollectionBoard[];
  /** Linked boards in this collection (live or ended) that the link no longer lists. */
  removalCandidates: Dashboard[];
  /** Listed boards that sit in a different local sub-collection than the link says. */
  moves: { boardId: string; collectionId: string }[];
}

/** What a link snapshot changes on this teacher's copy of the collection. */
export function planRemoteSync(input: {
  link: LinkedCollection;
  root: Collection;
  collections: Collection[];
  dashboards: Dashboard[];
}): RemoteSyncPlan {
  const { link, root, collections, dashboards } = input;
  const tree = collectionTreeIds(root.id, collections);
  const local = collections.filter((c) => tree.has(c.id) && c.id !== root.id);
  const localByKey = new Map(local.map((c) => [sectionKey(c), c]));

  const name = safeName(link.name, root.name);
  const color = safeStyleValue(link.color);
  const icon = safeStyleValue(link.icon);
  const metadata: RemoteSyncPlan['metadata'] = {};
  if (name !== root.name) metadata.name = name;
  if (color !== undefined && color !== root.color) metadata.color = color;
  if (icon !== undefined && icon !== root.icon) metadata.icon = icon;

  const sections = orderSectionsParentsFirst(link.sections ?? []);
  const createSections: LinkedCollectionSection[] = [];
  const updateSections: RemoteSyncPlan['updateSections'] = [];
  for (const section of sections) {
    const existing = localByKey.get(section.id);
    if (!existing) {
      createSections.push(section);
      continue;
    }
    const patch: Partial<Pick<Collection, 'name' | 'color'>> = {};
    const sectionName = safeName(section.name, existing.name);
    if (sectionName !== existing.name) patch.name = sectionName;
    if (section.color !== undefined && section.color !== existing.color) {
      patch.color = section.color;
    }
    if (Object.keys(patch).length > 0) {
      updateSections.push({ collectionId: existing.id, patch });
    }
  }

  const entries = uniqueLinkedBoards(link.boards);
  const listed = new Map(entries.map((e) => [e.shareId, e]));
  const liveLocal = new Map<string, Dashboard>();
  for (const d of dashboards) {
    const shareId = liveShareIdOf(d);
    if (shareId && !liveLocal.has(shareId)) liveLocal.set(shareId, d);
  }

  const missingEntries = entries.filter((e) => !liveLocal.has(e.shareId));

  // Ended copies count too: an open board learns its share ended before the link drops it.
  const removalCandidates = dashboards.filter(
    (d) =>
      !!d.linkedShareId &&
      tree.has(d.collectionId ?? '') &&
      !listed.has(d.linkedShareId)
  );

  const moves: RemoteSyncPlan['moves'] = [];
  for (const entry of entries) {
    const board = liveLocal.get(entry.shareId);
    if (!board || !tree.has(board.collectionId ?? '')) continue;
    const target = entry.sectionId
      ? localByKey.get(entry.sectionId)?.id
      : root.id;
    if (target && target !== board.collectionId) {
      moves.push({ boardId: board.id, collectionId: target });
    }
  }

  return {
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
    createSections,
    updateSections,
    missingEntries,
    removalCandidates,
    moves,
  };
}

export interface LocalSyncPlan {
  /** Local sub-collections the link doesn't list yet. */
  newSections: LinkedCollectionSection[];
  /** Boards in the collection with no share: new, moved in or duplicated. */
  boardsToShare: { board: Dashboard; sectionId?: string }[];
}

/** What this teacher added locally that the link should list (step 5). */
export function planLocalSync(input: {
  link: LinkedCollection;
  root: Collection;
  collections: Collection[];
  dashboards: Dashboard[];
}): LocalSyncPlan {
  const { link, root, collections, dashboards } = input;
  const tree = collectionTreeIds(root.id, collections);
  const byId = new Map(collections.map((c) => [c.id, c]));
  const known = new Set((link.sections ?? []).map((s) => s.id));

  const keyOf = (collectionId: string | null | undefined) => {
    if (!collectionId || collectionId === root.id) return undefined;
    const c = byId.get(collectionId);
    return c ? sectionKey(c) : undefined;
  };

  const siblingCount = new Map<string | null, number>();
  for (const s of link.sections ?? []) {
    const parent = s.parentId ?? null;
    siblingCount.set(parent, (siblingCount.get(parent) ?? 0) + 1);
  }
  const newSections: LinkedCollectionSection[] = [];
  // Parents first, so a new parent is listed before its new children.
  const queue = [root.id];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const parentId = queue.shift() ?? '';
    const children = collections
      .filter((c) => c.parentCollectionId === parentId && tree.has(c.id))
      .sort((a, b) => a.order - b.order);
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      queue.push(child.id);
      const key = sectionKey(child);
      if (known.has(key)) continue;
      const parentKey = keyOf(child.parentCollectionId) ?? null;
      const order = siblingCount.get(parentKey) ?? 0;
      siblingCount.set(parentKey, order + 1);
      newSections.push({
        id: key,
        name: child.name,
        parentId: parentKey,
        order,
        ...(child.color !== undefined && { color: child.color }),
      });
      known.add(key);
    }
  }

  // Boards with any linkage, ended included, are settled by the remote side first.
  const boardsToShare = dashboards
    .filter((d) => tree.has(d.collectionId ?? '') && !d.linkedShareId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((board) => {
      const sectionId = keyOf(board.collectionId);
      return sectionId ? { board, sectionId } : { board };
    });

  return { newSections, boardsToShare };
}

/** The live linked collection a board sits in, if any. */
export const linkedRootOf = (
  board: Pick<Dashboard, 'collectionId'>,
  collections: Collection[]
): Collection | undefined => {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const seen = new Set<string>();
  for (
    let c = board.collectionId ? byId.get(board.collectionId) : undefined;
    c && !seen.has(c.id);
    c = c.parentCollectionId ? byId.get(c.parentCollectionId) : undefined
  ) {
    seen.add(c.id);
    if (isLiveLinkedRoot(c)) return c;
  }
  return undefined;
};
