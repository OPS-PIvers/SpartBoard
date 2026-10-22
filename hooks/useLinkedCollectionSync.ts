// Membership sync for Synced / View-Only collections (docs/plans/COLLECTION_SHARING.md slice 4).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { logError } from '@/utils/logError';
import {
  linkedBoardFromShare,
  safeName,
  sharedBoardBelongsToLink,
  uniqueLinkedBoards,
} from '@/utils/linkedCollectionImport';
import {
  isLinkedCollectionImporting,
  linkedCollectionImportsVersion,
  subscribeLinkedCollectionImports,
} from '@/utils/linkedCollectionImportLock';
import {
  canEditLinkedCollection,
  collectionTreeIds,
  isLinkMember,
  isLiveLinkedRoot,
  linkedRootOf,
  liveLinkedRoots,
  liveShareIdOf,
  planLocalSync,
  planRemoteSync,
  sectionKey,
} from '@/utils/linkedCollectionSync';
import type { SharedBoardSnapshot } from '@/hooks/useFirestore';
import type { useLinkedCollection } from '@/hooks/useLinkedCollection';
import type { UseCollectionsResult } from '@/hooks/useCollections';
import type {
  Collection,
  Dashboard,
  DashboardShareRole,
  LinkedCollection,
  LinkedCollectionBoard,
  LinkedCollectionMode,
} from '@/types';

const BATCH = 10;

export interface BoardLinkFields {
  linkedShareId: string;
  linkedShareRole: DashboardShareRole;
  linkedShareHostName?: string;
  linkedShareEnded: false;
}

export interface LinkedCollectionSyncDeps {
  enabled: boolean;
  uid: string | null;
  displayName?: string;
  collections: Collection[];
  dashboards: Dashboard[];
  collectionsApi: Pick<
    UseCollectionsResult,
    'createCollection' | 'setCollectionMetadata'
  >;
  linkedCollectionApi: Pick<
    ReturnType<typeof useLinkedCollection>,
    | 'subscribeLinkedCollection'
    | 'editLinkedCollection'
    | 'updateLinkedCollection'
  >;
  loadSharedBoard: (shareId: string) => Promise<SharedBoardSnapshot | null>;
  joinSharedBoard: (
    shareId: string,
    role: 'collaborator' | 'viewer',
    displayName?: string
  ) => Promise<void>;
  leaveSharedBoard: (shareId: string) => Promise<void>;
  stopSharingBoard: (shareId: string) => Promise<void>;
  /** Writes a `/shared_boards` doc for the board, stamped with the link. */
  shareBoard: (
    board: Dashboard,
    mode: LinkedCollectionMode,
    linkId: string
  ) => Promise<string>;
  createBoard: (
    data: Dashboard,
    collectionId: string
  ) => Promise<string | undefined>;
  /** Deletes the local board for good, in Firestore and on screen. */
  deleteBoard: (boardId: string) => Promise<void>;
  /** Sets, or with null clears, a board's share linkage. */
  setBoardLink: (
    boardId: string,
    link: BoardLinkFields | null
  ) => Promise<void>;
  moveBoard: (boardId: string, collectionId: string) => Promise<void>;
}

/** A delete, or a move to a collection (null = top level). */
export type BoardDestination =
  { kind: 'delete' } | { kind: 'move'; collectionId: string | null };

interface RemovalTarget {
  board: Dashboard;
  shareId: string;
  linkId: string;
  /** The sub-collection key it moves to inside the same shared collection, or `remove`. */
  change: { kind: 'remove' } | { kind: 'move'; sectionId?: string };
}

export const useLinkedCollectionSync = (deps: LinkedCollectionSyncDeps) => {
  const depsRef = useRef(deps);
  useLayoutEffect(() => {
    depsRef.current = deps;
  });

  const [links, setLinks] = useState<ReadonlyMap<string, LinkedCollection>>(
    () => new Map()
  );
  const linksRef = useRef(links);

  // Session bookkeeping: each guards one race between a local write and the next link snapshot.
  const queues = useRef(new Map<string, Promise<void>>());
  const scheduled = useRef(new Set<string>());
  /** Share ids this session added to a link that no snapshot has listed yet. */
  const pendingAdds = useRef(new Set<string>());
  /** Listed share ids already imported (or tried) this session. */
  const handledImports = useRef(new Set<string>());
  /** Board id -> share id this session created for it. */
  const sharedAs = useRef(new Map<string, string>());
  const pushedSections = useRef(new Set<string>());
  /** Link section id -> local collection id created this session. */
  const createdSections = useRef(new Map<string, string>());
  /** Boards on their way out (deleted, moved out or removed remotely). */
  const leaving = useRef(new Set<string>());
  /** Live shares in a linked collection that belong to some other share. */
  const notOurs = useRef(new Set<string>());
  /** Shares this teacher deleted locally; not re-imported this session. */
  const deletedLocally = useRef(new Set<string>());

  const importsVersion = useSyncExternalStore(
    subscribeLinkedCollectionImports,
    linkedCollectionImportsVersion
  );

  const enqueue = useCallback((linkId: string, job: () => Promise<void>) => {
    const prev = queues.current.get(linkId) ?? Promise.resolve();
    const next = prev.then(job).catch((err: unknown) => {
      logError('useLinkedCollectionSync', err, { linkId });
    });
    queues.current.set(linkId, next);
  }, []);

  /** Current state for one link, or null when sync has nothing to do for it. */
  const contextFor = useCallback((linkId: string) => {
    const d = depsRef.current;
    const link = linksRef.current.get(linkId);
    if (!d.enabled || !d.uid || !link) return null;
    if (isLinkedCollectionImporting(linkId)) return null;
    // Ended links and members who left are slice 5 (Stop sharing / Leave).
    if (link.ended || !isLinkMember(link, d.uid)) return null;
    const root = d.collections.find(
      (c) => isLiveLinkedRoot(c) && c.linkedCollectionId === linkId
    );
    if (!root) return null;
    const keyToLocal = new Map<string, string>(createdSections.current);
    const tree = collectionTreeIds(root.id, d.collections);
    for (const c of d.collections) {
      if (tree.has(c.id) && c.id !== root.id)
        keyToLocal.set(sectionKey(c), c.id);
    }
    return { d, uid: d.uid, link, root, keyToLocal };
  }, []);

  const importMissing = useCallback(
    async (
      ctx: NonNullable<ReturnType<typeof contextFor>>,
      entries: LinkedCollectionBoard[]
    ) => {
      const { d, uid, link, root, keyToLocal } = ctx;
      const todo = entries.filter(
        (e) =>
          !handledImports.current.has(e.shareId) &&
          !pendingAdds.current.has(e.shareId) &&
          !deletedLocally.current.has(e.shareId)
      );
      if (todo.length === 0) return;
      todo.forEach((e) => handledImports.current.add(e.shareId));
      const role = link.mode === 'synced' ? 'collaborator' : 'viewer';
      let order = d.dashboards.reduce((m, b) => Math.max(m, b.order ?? 0), 0);
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH);
        await Promise.allSettled(
          batch.map(async (entry) => {
            const snap = await d.loadSharedBoard(entry.shareId);
            // Trust rule: boards[] is member-written, so the share must name this link and mode.
            if (!snap || !sharedBoardBelongsToLink(snap, link)) return;
            order += 1;
            const data = linkedBoardFromShare(entry, snap, {
              uid,
              role,
              fallbackName: root.name,
              order,
            });
            const collectionId =
              (entry.sectionId ? keyToLocal.get(entry.sectionId) : undefined) ??
              root.id;
            const boardId = await d.createBoard(data, collectionId);
            if (!boardId) return;
            if (data.linkedShareRole !== 'owner' && !snap.participants?.[uid]) {
              await d
                .joinSharedBoard(entry.shareId, role, d.displayName)
                .catch((err: unknown) =>
                  logError('useLinkedCollectionSync.joinBoard', err, {
                    shareId: entry.shareId,
                  })
                );
            }
          })
        );
      }
    },
    []
  );

  /** A listed board the link dropped: the member who removed it confirmed it goes for everyone (D4). */
  const removeDropped = useCallback(
    async (
      ctx: NonNullable<ReturnType<typeof contextFor>>,
      candidates: Dashboard[]
    ) => {
      const { d, link } = ctx;
      for (const board of candidates) {
        const shareId = liveShareIdOf(board);
        if (
          !shareId ||
          pendingAdds.current.has(shareId) ||
          notOurs.current.has(shareId) ||
          leaving.current.has(board.id)
        ) {
          continue;
        }
        let snap: SharedBoardSnapshot | null;
        try {
          snap = await d.loadSharedBoard(shareId);
        } catch {
          continue;
        }
        if (snap && snap.linkedCollectionId !== link.linkId) {
          notOurs.current.add(shareId);
          continue;
        }
        leaving.current.add(board.id);
        try {
          if (!snap && board.linkedShareRole === 'owner') {
            // Our own board whose share is already gone: keep it as a plain board.
            await d.setBoardLink(board.id, null);
            continue;
          }
          await d.deleteBoard(board.id);
          deletedLocally.current.add(shareId);
          if (snap && board.linkedShareRole === 'owner') {
            await d.stopSharingBoard(shareId);
          }
        } catch (err) {
          leaving.current.delete(board.id);
          logError('useLinkedCollectionSync.remove', err, { shareId });
        }
      }
    },
    []
  );

  const applyRemote = useCallback(
    async (linkId: string, fresh: boolean) => {
      const ctx = contextFor(linkId);
      if (!ctx) return;
      const { d, link, root, keyToLocal } = ctx;
      for (const e of uniqueLinkedBoards(link.boards)) {
        pendingAdds.current.delete(e.shareId);
      }
      const plan = planRemoteSync({
        link,
        root,
        collections: d.collections,
        dashboards: d.dashboards,
      });
      if (plan.metadata) {
        await d.collectionsApi.setCollectionMetadata(root.id, plan.metadata);
      }
      for (const { collectionId, patch } of plan.updateSections) {
        await d.collectionsApi.setCollectionMetadata(collectionId, patch);
      }
      for (const section of plan.createSections) {
        if (keyToLocal.has(section.id)) continue;
        const parent =
          (section.parentId ? keyToLocal.get(section.parentId) : undefined) ??
          root.id;
        const id = await d.collectionsApi.createCollection(
          safeName(section.name, root.name),
          parent,
          {
            color: section.color,
            order: section.order,
            linkedSectionId: section.id,
          }
        );
        createdSections.current.set(section.id, id);
        keyToLocal.set(section.id, id);
      }
      for (const move of plan.moves) {
        if (leaving.current.has(move.boardId)) continue;
        await d.moveBoard(move.boardId, move.collectionId);
      }
      await importMissing(ctx, plan.missingEntries);
      // A cached snapshot can predate boards added since; only a server one may remove boards.
      if (fresh) await removeDropped(ctx, plan.removalCandidates);
    },
    [contextFor, importMissing, removeDropped]
  );

  /** Imports listed boards that are missing and lists what this teacher added. */
  const reconcile = useCallback(
    async (linkId: string) => {
      scheduled.current.delete(linkId);
      const ctx = contextFor(linkId);
      if (!ctx) return;
      const { d, uid, link, root } = ctx;
      const remote = planRemoteSync({
        link,
        root,
        collections: d.collections,
        dashboards: d.dashboards,
      });
      await importMissing(ctx, remote.missingEntries);
      if (!canEditLinkedCollection(link, uid)) return;

      const local = planLocalSync({
        link,
        root,
        collections: d.collections,
        dashboards: d.dashboards,
      });
      const sections = local.newSections.filter(
        (s) => !pushedSections.current.has(s.id)
      );
      const boards = local.boardsToShare.filter(
        ({ board }) =>
          !sharedAs.current.has(board.id) && !leaving.current.has(board.id)
      );
      if (sections.length === 0 && boards.length === 0) return;
      sections.forEach((s) => pushedSections.current.add(s.id));

      const shared: {
        board: Dashboard;
        shareId: string;
        sectionId?: string;
      }[] = [];
      for (let i = 0; i < boards.length; i += BATCH) {
        const batch = boards.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map(async ({ board, sectionId }) => {
            // Claimed before the write, so a re-run can't share it twice; a failure stays claimed until reload.
            sharedAs.current.set(board.id, '');
            const shareId = await d.shareBoard(board, link.mode, link.linkId);
            sharedAs.current.set(board.id, shareId);
            pendingAdds.current.add(shareId);
            return { board, shareId, sectionId };
          })
        );
        for (const r of results) {
          if (r.status === 'fulfilled') shared.push(r.value);
          else logError('useLinkedCollectionSync.share', r.reason, { linkId });
        }
      }

      const undo = async () => {
        for (const s of shared) {
          pendingAdds.current.delete(s.shareId);
          await d.stopSharingBoard(s.shareId).catch(() => undefined);
        }
      };
      let listed = false;
      try {
        listed = await d.linkedCollectionApi.editLinkedCollection(
          link.linkId,
          uid,
          (current) => {
            if (!canEditLinkedCollection(current, uid)) return null;
            const have = new Set(current.boards.map((b) => b.shareId));
            const haveSections = new Set(
              (current.sections ?? []).map((s) => s.id)
            );
            const maxOrder = current.boards.reduce(
              (m, b) => Math.max(m, typeof b.order === 'number' ? b.order : 0),
              -1
            );
            const added = shared
              .filter((s) => !have.has(s.shareId))
              .map((s, i) => ({
                shareId: s.shareId,
                name: safeName(s.board.name, root.name),
                order: maxOrder + 1 + i,
                ...(s.sectionId ? { sectionId: s.sectionId } : {}),
              }));
            const newSections = sections.filter((s) => !haveSections.has(s.id));
            if (added.length === 0 && newSections.length === 0) return null;
            return {
              boards: [...current.boards, ...added],
              ...(newSections.length > 0 && {
                sections: [...(current.sections ?? []), ...newSections],
              }),
            };
          }
        );
      } catch (err) {
        logError('useLinkedCollectionSync.list', err, { linkId });
        sections.forEach((s) => pushedSections.current.delete(s.id));
        await undo();
        return;
      }
      if (!listed && shared.length > 0) {
        await undo();
        return;
      }
      for (const s of shared) {
        await d.setBoardLink(s.board.id, {
          linkedShareId: s.shareId,
          linkedShareRole: 'owner',
          linkedShareHostName: d.displayName,
          linkedShareEnded: false,
        });
      }
    },
    [contextFor, importMissing]
  );

  const rootKey =
    deps.enabled && deps.uid
      ? liveLinkedRoots(deps.collections)
          .map((c) => c.linkedCollectionId)
          .sort()
          .join('|')
      : '';

  // One listener per shared collection (D3 keeps its boards to one listener while open).
  useEffect(() => {
    if (!rootKey) return;
    const linkIds = [...new Set(rootKey.split('|'))];
    const { linkedCollectionApi } = depsRef.current;
    const unsubs = linkIds.map((linkId) =>
      linkedCollectionApi.subscribeLinkedCollection(linkId, (link, meta) => {
        const next = new Map(linksRef.current);
        if (link) next.set(linkId, link);
        else next.delete(linkId);
        linksRef.current = next;
        setLinks(next);
        if (link) enqueue(linkId, () => applyRemote(linkId, !meta?.fromCache));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [rootKey, enqueue, applyRemote]);

  const { enabled, uid, dashboards, collections } = deps;
  // Local adds (new, duplicated or moved-in boards and sub-collections) and imports a snapshot couldn't finish.
  useEffect(() => {
    if (!enabled || !uid) return;
    for (const [linkId, link] of links) {
      if (scheduled.current.has(linkId)) continue;
      if (link.ended || !isLinkMember(link, uid)) continue;
      const root = collections.find(
        (c) => isLiveLinkedRoot(c) && c.linkedCollectionId === linkId
      );
      if (!root || isLinkedCollectionImporting(linkId)) continue;
      const remote = planRemoteSync({ link, root, collections, dashboards });
      const needsImport = remote.missingEntries.some(
        (e) =>
          !handledImports.current.has(e.shareId) &&
          !pendingAdds.current.has(e.shareId) &&
          !deletedLocally.current.has(e.shareId)
      );
      let needsPush = false;
      if (canEditLinkedCollection(link, uid)) {
        const local = planLocalSync({ link, root, collections, dashboards });
        needsPush =
          local.newSections.some((s) => !pushedSections.current.has(s.id)) ||
          local.boardsToShare.some(
            ({ board }) =>
              !sharedAs.current.has(board.id) && !leaving.current.has(board.id)
          );
      }
      if (!needsImport && !needsPush) continue;
      scheduled.current.add(linkId);
      enqueue(linkId, () => reconcile(linkId));
    }
  }, [
    enabled,
    uid,
    dashboards,
    collections,
    links,
    importsVersion,
    enqueue,
    reconcile,
  ]);

  /** Boards a delete or move would take out of a shared collection this teacher can edit. */
  const removalTargets = useCallback(
    (boardIds: string[], destination: BoardDestination): RemovalTarget[] => {
      const d = depsRef.current;
      if (!d.enabled || !d.uid) return [];
      const targets: RemovalTarget[] = [];
      for (const id of boardIds) {
        const board = d.dashboards.find((b) => b.id === id);
        const shareId = board && liveShareIdOf(board);
        if (!board || !shareId) continue;
        const root = linkedRootOf(board, d.collections);
        const linkId = root?.linkedCollectionId;
        const link = linkId ? linksRef.current.get(linkId) : undefined;
        if (!root || !linkId || !link) continue;
        if (!canEditLinkedCollection(link, d.uid)) continue;
        if (!link.boards.some((b) => b.shareId === shareId)) continue;
        const tree = collectionTreeIds(root.id, d.collections);
        if (
          destination.kind === 'move' &&
          tree.has(destination.collectionId ?? '')
        ) {
          const dest = d.collections.find(
            (c) => c.id === destination.collectionId
          );
          const sectionId =
            dest && dest.id !== root.id ? sectionKey(dest) : undefined;
          targets.push({
            board,
            shareId,
            linkId,
            change: { kind: 'move', sectionId },
          });
        } else {
          targets.push({ board, shareId, linkId, change: { kind: 'remove' } });
        }
      }
      return targets;
    },
    []
  );

  /** How many of these boards a delete or move would remove for everyone (for the confirm). */
  const countRemovedForEveryone = useCallback(
    (boardIds: string[], destination: BoardDestination): number =>
      removalTargets(boardIds, destination).filter(
        (t) => t.change.kind === 'remove'
      ).length,
    [removalTargets]
  );

  /** Runs before a delete or move: updates the shared list and detaches boards that leave it. Call the result once the change is done. */
  const beforeBoardsLeave = useCallback(
    async (
      boardIds: string[],
      destination: BoardDestination
    ): Promise<() => void> => {
      const noop = () => undefined;
      const d = depsRef.current;
      if (!d.enabled || !d.uid) return noop;
      const uid = d.uid;
      if (destination.kind === 'delete') {
        // A board deleted locally from a shared collection isn't brought back by sync.
        for (const id of boardIds) {
          const board = d.dashboards.find((b) => b.id === id);
          const shareId = board && liveShareIdOf(board);
          if (shareId && linkedRootOf(board, d.collections)) {
            deletedLocally.current.add(shareId);
          }
        }
      }
      const targets = removalTargets(boardIds, destination);
      if (targets.length === 0) return noop;
      const byLink = new Map<string, RemovalTarget[]>();
      for (const t of targets) {
        byLink.set(t.linkId, [...(byLink.get(t.linkId) ?? []), t]);
        if (t.change.kind === 'remove') leaving.current.add(t.board.id);
      }
      try {
        for (const [linkId, list] of byLink) {
          const changes = new Map(list.map((t) => [t.shareId, t.change]));
          await d.linkedCollectionApi.editLinkedCollection(
            linkId,
            uid,
            (current) => {
              if (!canEditLinkedCollection(current, uid)) return null;
              const boards = current.boards.flatMap((b) => {
                const change = changes.get(b.shareId);
                if (!change) return [b];
                if (change.kind === 'remove') return [];
                const { sectionId: _old, ...rest } = b;
                return [
                  change.sectionId
                    ? { ...rest, sectionId: change.sectionId }
                    : rest,
                ];
              });
              return { boards };
            }
          );
        }
      } catch (err) {
        targets.forEach((t) => leaving.current.delete(t.board.id));
        throw err;
      }
      for (const t of targets) {
        if (t.change.kind !== 'remove') continue;
        sharedAs.current.delete(t.board.id);
        try {
          if (t.board.linkedShareRole === 'owner') {
            await d.stopSharingBoard(t.shareId);
          } else {
            await d.leaveSharedBoard(t.shareId);
          }
          // A moved-out board stays with this teacher as their own board.
          if (destination.kind === 'move')
            await d.setBoardLink(t.board.id, null);
        } catch (err) {
          logError('useLinkedCollectionSync.detach', err, {
            shareId: t.shareId,
          });
        }
      }
      // Until the move lands the detached board still sits in the collection; keep sync off it till then.
      return () => targets.forEach((t) => leaving.current.delete(t.board.id));
    },
    [removalTargets]
  );

  /** After a local rename or recolor: carries it to the shared collection when this teacher can edit it. */
  const pushCollectionMetadata = useCallback(
    async (
      collectionId: string,
      patch: Partial<Pick<Collection, 'name' | 'color' | 'icon'>>
    ) => {
      const d = depsRef.current;
      if (!d.enabled || !d.uid) return;
      const uid = d.uid;
      const target = d.collections.find((c) => c.id === collectionId);
      if (!target) return;
      const root = isLiveLinkedRoot(target)
        ? target
        : linkedRootOf({ collectionId: target.id }, d.collections);
      const linkId = root?.linkedCollectionId;
      const link = linkId ? linksRef.current.get(linkId) : undefined;
      if (!root || !linkId || !link || !canEditLinkedCollection(link, uid)) {
        return;
      }
      try {
        if (root.id === target.id) {
          await d.linkedCollectionApi.updateLinkedCollection(
            linkId,
            uid,
            patch
          );
          return;
        }
        const key = sectionKey(target);
        await d.linkedCollectionApi.editLinkedCollection(
          linkId,
          uid,
          (current) => {
            const sections = current.sections ?? [];
            if (!sections.some((s) => s.id === key)) return null;
            return {
              sections: sections.map((s) =>
                s.id === key
                  ? {
                      ...s,
                      ...(patch.name !== undefined && { name: patch.name }),
                      ...(patch.color !== undefined && { color: patch.color }),
                    }
                  : s
              ),
            };
          }
        );
      } catch (err) {
        logError('useLinkedCollectionSync.metadata', err, { linkId });
      }
    },
    []
  );

  return {
    links,
    countRemovedForEveryone,
    beforeBoardsLeave,
    pushCollectionMetadata,
  };
};
