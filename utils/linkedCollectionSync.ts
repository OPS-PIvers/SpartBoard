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
  /** Local sub-collections someone deleted or moved out, deepest first. */
  staleSections: Collection[];
  /** Listed boards whose local name differs from the link. */
  renames: { boardId: string; name: string }[];
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

  const deleted = new Set(link.deletedSections ?? []);
  const sections = orderSectionsParentsFirst(
    (link.sections ?? []).filter((s) => !deleted.has(s.id))
  );
  // A sub-collection this teacher moved out keeps its key until the link drops it.
  const outsideKeys = new Set(
    collections.filter((c) => !tree.has(c.id)).map(sectionKey)
  );
  const createSections: LinkedCollectionSection[] = [];
  const updateSections: RemoteSyncPlan['updateSections'] = [];
  for (const section of sections) {
    const existing = localByKey.get(section.id);
    if (!existing) {
      if (!outsideKeys.has(section.id)) createSections.push(section);
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

  const renames: RemoteSyncPlan['renames'] = [];
  for (const entry of entries) {
    const board = liveLocal.get(entry.shareId);
    if (!board || !tree.has(board.collectionId ?? '')) continue;
    const name = safeName(entry.name, board.name);
    if (name !== board.name) renames.push({ boardId: board.id, name });
  }

  // Only ids the link records as deleted: a new local one just isn't listed yet.
  const depth = (c: Collection): number => {
    let n = 0;
    const seen = new Set<string>();
    for (
      let cur: Collection | undefined = c;
      cur && cur.id !== root.id && !seen.has(cur.id);
      cur = collections.find((x) => x.id === cur?.parentCollectionId)
    ) {
      seen.add(cur.id);
      n += 1;
    }
    return n;
  };
  const staleSections = local
    .filter((c) => deleted.has(sectionKey(c)))
    .sort((a, b) => depth(b) - depth(a));

  return {
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
    createSections,
    updateSections,
    missingEntries,
    removalCandidates,
    moves,
    staleSections,
    renames,
  };
}

/** Sub-collection keys in a collection's subtree, the collection included. */
export const subtreeSectionKeys = (
  collectionId: string,
  collections: Collection[]
): Set<string> => {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const keys = new Set<string>();
  for (const id of collectionTreeIds(collectionId, collections)) {
    const c = byId.get(id);
    if (c) keys.add(sectionKey(c));
  }
  return keys;
};

const MAX_DELETED_SECTIONS = 200;

/** Keys of a section and every section under it, as the link records them. */
export const linkedSubtreeKeys = (
  sections: LinkedCollectionSection[],
  key: string
): Set<string> => {
  const keys = new Set([key]);
  for (let grew = true; grew;) {
    grew = false;
    for (const s of sections) {
      if (s.parentId && keys.has(s.parentId) && !keys.has(s.id)) {
        keys.add(s.id);
        grew = true;
      }
    }
  }
  return keys;
};

/** The deleted-section list with these keys added, newest last, capped. */
export const withDeletedSections = (
  current: string[] | undefined,
  keys: Iterable<string>
): string[] => {
  const add = new Set(keys);
  const next = [...(current ?? []).filter((k) => !add.has(k)), ...add];
  return next.slice(-MAX_DELETED_SECTIONS);
};

/** The link with these sections removed and recorded; their boards and children go to the nearest kept section above. */
export function sectionsAfterRemove(
  current: Pick<LinkedCollection, 'sections' | 'boards' | 'deletedSections'>,
  removedKeys: Set<string>
): Pick<LinkedCollection, 'sections' | 'boards' | 'deletedSections'> {
  const all = current.sections ?? [];
  const byId = new Map(all.map((s) => [s.id, s]));
  const keptAbove = (key: string | null | undefined): string | null => {
    const seen = new Set<string>();
    let cur = key ?? null;
    while (cur && removedKeys.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
    return cur && byId.has(cur) && !removedKeys.has(cur) ? cur : null;
  };
  const sections = all
    .filter((s) => !removedKeys.has(s.id))
    .map((s) =>
      s.parentId && removedKeys.has(s.parentId)
        ? { ...s, parentId: keptAbove(s.parentId) }
        : s
    );
  const boards = current.boards.flatMap((b) => {
    if (!b.sectionId || !removedKeys.has(b.sectionId)) return [b];
    const { sectionId: _old, ...rest } = b;
    const above = keptAbove(b.sectionId);
    return [above ? { ...rest, sectionId: above } : rest];
  });
  return {
    sections,
    boards,
    deletedSections: withDeletedSections(current.deletedSections, removedKeys),
  };
}

/** Local collection id each listed section should sit under, where that differs from now. */
export function sectionReparents(input: {
  link: Pick<LinkedCollection, 'sections' | 'deletedSections'>;
  rootId: string;
  keyToLocal: ReadonlyMap<string, string>;
  collections: Collection[];
}): { collectionId: string; parentId: string }[] {
  const { link, rootId, keyToLocal, collections } = input;
  const deleted = new Set(link.deletedSections ?? []);
  const byId = new Map(collections.map((c) => [c.id, c]));
  const out: { collectionId: string; parentId: string }[] = [];
  for (const section of link.sections ?? []) {
    if (deleted.has(section.id)) continue;
    const localId = keyToLocal.get(section.id);
    const local = localId ? byId.get(localId) : undefined;
    const parent = section.parentId ? keyToLocal.get(section.parentId) : rootId;
    if (!local || !parent || parent === local.id) continue;
    if (parent !== local.parentCollectionId) {
      out.push({ collectionId: local.id, parentId: parent });
    }
  }
  return out;
}

/** The link's sections after a sub-collection moves under another one (null = the top). */
export function sectionsAfterMove(
  sections: LinkedCollectionSection[],
  key: string,
  parentKey: string | null
): LinkedCollectionSection[] | null {
  if (!sections.some((s) => s.id === key)) return null;
  const order =
    sections
      .filter((s) => (s.parentId ?? null) === parentKey && s.id !== key)
      .reduce((m, s) => Math.max(m, s.order), -1) + 1;
  return sections.map((s) =>
    s.id === key ? { ...s, parentId: parentKey, order } : s
  );
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
  const known = new Set([
    ...(link.sections ?? []).map((s) => s.id),
    ...(link.deletedSections ?? []),
  ]);

  const keyOf = (collectionId: string | null | undefined) => {
    if (!collectionId || collectionId === root.id) return undefined;
    const c = byId.get(collectionId);
    return c ? sectionKey(c) : undefined;
  };

  // Next free order per parent: after the highest, since deletes leave gaps.
  const nextOrder = new Map<string | null, number>();
  for (const s of link.sections ?? []) {
    const parent = s.parentId ?? null;
    nextOrder.set(parent, Math.max(nextOrder.get(parent) ?? 0, s.order + 1));
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
      // Includes deleted ids: someone removed it for everyone, so it isn't listed again.
      if (known.has(key)) continue;
      const parentKey = keyOf(child.parentCollectionId) ?? null;
      const order = nextOrder.get(parentKey) ?? 0;
      nextOrder.set(parentKey, order + 1);
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
