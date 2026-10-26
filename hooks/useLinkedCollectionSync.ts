// Membership sync for Synced / View-Only collections (docs/plans/COLLECTION_SHARING.md slice 4).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import i18n from '@/i18n';
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
  boardBelongsToShare,
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
  linkedSubtreeKeys,
  sectionReparents,
  sectionsAfterMove,
  sectionsAfterRemove,
  subtreeSectionKeys,
} from '@/utils/linkedCollectionSync';
import type { DeleteCollectionMode } from '@/hooks/useCollections';
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
const MAX_IMPORT_ATTEMPTS = 3;

const isNotFound = (err: unknown): boolean =>
  (err as { code?: unknown } | null)?.code === 'not-found';

const isPermissionDenied = (err: unknown): boolean =>
  (err as { code?: unknown } | null)?.code === 'permission-denied';

export interface BoardLinkFields {
  linkedShareId: string;
  linkedShareRole: DashboardShareRole;
  linkedShareHostName?: string;
  linkedShareHostUid?: string;
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
    | 'createCollection'
    | 'setCollectionMetadata'
    | 'setCollectionLink'
    | 'moveCollection'
    | 'deleteCollection'
  >;
  linkedCollectionApi: Pick<
    ReturnType<typeof useLinkedCollection>,
    | 'subscribeLinkedCollection'
    | 'editLinkedCollection'
    | 'updateLinkedCollection'
    | 'endLinkedCollection'
    | 'leaveLinkedCollection'
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
  /** Tells the teacher their shared collection ended. */
  notify?: (message: string) => void;
  /** Writes a board's name without a toast. */
  renameBoard: (boardId: string, name: string) => Promise<void>;
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

/** Boards in the collection that mirror one of the link's shares. */
const boardsOfLink = (
  d: Pick<LinkedCollectionSyncDeps, 'collections' | 'dashboards'>,
  root: Collection,
  linkId: string,
  link: LinkedCollection | null | undefined
): Dashboard[] => {
  const tree = collectionTreeIds(root.id, d.collections);
  const listed = new Set((link?.boards ?? []).map((b) => b.shareId));
  return d.dashboards.filter(
    (b) =>
      !!b.linkedShareId &&
      tree.has(b.collectionId ?? '') &&
      (listed.has(b.linkedShareId) ||
        boardBelongsToShare(b, b.linkedShareId, linkId))
  );
};

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
  const importFailures = useRef(new Map<string, number>());
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
  /** Boards this teacher deleted this session. */
  const deletedBoards = useRef(new Set<string>());
  /** Links this session is stopping, leaving or closing; sync leaves them alone. */
  const closing = useRef(new Set<string>());
  /** Root collections this session already closed. */
  const closedRoots = useRef(new Set<string>());
  /** Local collections being moved, deleted or already deleted by this session. */
  const settlingCollections = useRef(new Set<string>());
  /** Link id -> board names its last snapshot listed. */
  const seenNames = useRef(new Map<string, Map<string, string>>());
  /** Board id -> a rename this session is listing that no snapshot has shown yet. */
  const pendingRenames = useRef(
    new Map<string, { name: string; written: boolean }>()
  );

  const importsVersion = useSyncExternalStore(
    subscribeLinkedCollectionImports,
    linkedCollectionImportsVersion
  );

  /** Runs a job after the link's earlier jobs; the result carries its outcome. */
  const runQueued = useCallback(
    <T>(linkId: string, job: () => Promise<T>): Promise<T> => {
      const prev = queues.current.get(linkId) ?? Promise.resolve();
      const result = prev.then(job);
      queues.current.set(
        linkId,
        result.then(
          () => undefined,
          (err: unknown) => {
            logError('useLinkedCollectionSync', err, { linkId });
          }
        )
      );
      return result;
    },
    []
  );

  const enqueue = useCallback(
    (linkId: string, job: () => Promise<void>) => {
      runQueued(linkId, job).catch(() => undefined);
    },
    [runQueued]
  );

  /** Current state for one link, or null when sync has nothing to do for it. */
  const contextFor = useCallback((linkId: string) => {
    const d = depsRef.current;
    const link = linksRef.current.get(linkId);
    if (!d.enabled || !d.uid || !link) return null;
    if (isLinkedCollectionImporting(linkId) || closing.current.has(linkId)) {
      return null;
    }
    if (link.ended || !isLinkMember(link, d.uid)) return null;
    const root = d.collections.find(
      (c) => isLiveLinkedRoot(c) && c.linkedCollectionId === linkId
    );
    if (!root) return null;
    const tree = collectionTreeIds(root.id, d.collections);
    const keyToLocal = new Map<string, string>();
    for (const c of d.collections) {
      if (!tree.has(c.id) || c.id === root.id) continue;
      keyToLocal.set(sectionKey(c), c.id);
      // Loaded now; dropping it lets a later delete of that sub-collection show.
      createdSections.current.delete(sectionKey(c));
    }
    for (const [key, id] of createdSections.current) {
      if (!keyToLocal.has(key)) keyToLocal.set(key, id);
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
        const results = await Promise.allSettled(
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
        // A thrown load or create may be transient: retry it a few times, not forever.
        results.forEach((r, j) => {
          if (r.status !== 'rejected') return;
          const shareId = batch[j].shareId;
          const failures = (importFailures.current.get(shareId) ?? 0) + 1;
          importFailures.current.set(shareId, failures);
          logError('useLinkedCollectionSync.import', r.reason, { shareId });
          if (!isPermissionDenied(r.reason) && failures < MAX_IMPORT_ATTEMPTS) {
            handledImports.current.delete(shareId);
          }
        });
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
        const shareId = board.linkedShareId;
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
          notOurs.current.add(shareId);
          continue;
        }
        if (snap && snap.linkedCollectionId !== link.linkId) {
          notOurs.current.add(shareId);
          continue;
        }
        leaving.current.add(board.id);
        try {
          if (!snap && !boardBelongsToShare(board, shareId, link.linkId)) {
            // A board shared on its own whose share ended: keep it as this teacher's board.
            await d.setBoardLink(board.id, null);
            leaving.current.delete(board.id);
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

  const applyRemoteRef = useRef<
    ((linkId: string, fresh: boolean, retry?: boolean) => Promise<void>) | null
  >(null);
  const applyRemote = useCallback(
    async (linkId: string, fresh: boolean, retry = true): Promise<void> => {
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
      let unsettled = false;
      // Fresh state per step: an earlier step may have changed the tree.
      const api = () => depsRef.current.collectionsApi;
      for (const { collectionId, parentId } of sectionReparents({
        link,
        rootId: root.id,
        keyToLocal,
        collections: depsRef.current.collections,
      })) {
        if (settlingCollections.current.has(collectionId)) continue;
        try {
          await api().moveCollection(collectionId, parentId);
        } catch (err) {
          unsettled = true;
          logError('useLinkedCollectionSync.reparent', err, { linkId });
        }
      }
      for (const move of plan.moves) {
        if (leaving.current.has(move.boardId)) continue;
        await d.moveBoard(move.boardId, move.collectionId);
      }
      const listedNames = new Map(link.boards.map((b) => [b.shareId, b.name]));
      for (const [boardId, pending] of pendingRenames.current) {
        const shareId = d.dashboards.find(
          (b) => b.id === boardId
        )?.linkedShareId;
        const shown = shareId && listedNames.get(shareId) === pending.name;
        // Someone else wrote after our rename landed, so the list is newer than it.
        if (shown || (pending.written && link.updatedBy !== ctx.uid)) {
          pendingRenames.current.delete(boardId);
        }
      }
      // Non-editors keep their own names until the list renames that board again.
      const editor = canEditLinkedCollection(link, ctx.uid);
      const lastSeen = seenNames.current.get(linkId);
      seenNames.current.set(linkId, listedNames);
      for (const { boardId, name } of plan.renames) {
        const shareId = d.dashboards.find(
          (b) => b.id === boardId
        )?.linkedShareId;
        if (
          !editor &&
          (!lastSeen || !shareId || lastSeen.get(shareId) === name)
        ) {
          continue;
        }
        if (
          leaving.current.has(boardId) ||
          pendingRenames.current.has(boardId)
        ) {
          continue;
        }
        try {
          await d.renameBoard(boardId, name);
        } catch (err) {
          logError('useLinkedCollectionSync.renameBoard', err, { linkId });
        }
      }
      await importMissing(ctx, plan.missingEntries);
      // A cached snapshot can predate boards added since; only a server one may remove boards.
      if (fresh) {
        await removeDropped(ctx, plan.removalCandidates);
        // Someone deleted or moved out this sub-collection; the link already moved its boards up.
        for (const section of plan.staleSections) {
          if (settlingCollections.current.has(section.id)) continue;
          if (!depsRef.current.collections.some((c) => c.id === section.id)) {
            continue;
          }
          settlingCollections.current.add(section.id);
          try {
            await api().deleteCollection(section.id, 'move-to-parent');
          } catch (err) {
            settlingCollections.current.delete(section.id);
            unsettled = true;
            logError('useLinkedCollectionSync.deleteSection', err, { linkId });
          }
        }
      }
      // One more pass once the tree has caught up with this one's changes.
      if (unsettled && retry) {
        setTimeout(() => {
          const again = applyRemoteRef.current;
          if (again) enqueue(linkId, () => again(linkId, fresh, false));
        }, 1000);
      }
    },
    [contextFor, importMissing, removeDropped, enqueue]
  );

  useLayoutEffect(() => {
    applyRemoteRef.current = applyRemote;
  });

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
      // A board deleted while it was being listed leaves the list again rather than coming back.
      const gone = shared.filter(
        (s) =>
          deletedBoards.current.has(s.board.id) ||
          !depsRef.current.dashboards.some((b) => b.id === s.board.id)
      );
      for (const s of shared) {
        if (gone.includes(s)) continue;
        await d.setBoardLink(s.board.id, {
          linkedShareId: s.shareId,
          linkedShareRole: 'owner',
          linkedShareHostName: d.displayName,
          linkedShareHostUid: uid,
          linkedShareEnded: false,
        });
      }
      if (gone.length > 0) {
        const goneIds = new Set(gone.map((s) => s.shareId));
        gone.forEach((s) => deletedLocally.current.add(s.shareId));
        await d.linkedCollectionApi
          .editLinkedCollection(link.linkId, uid, (current) =>
            canEditLinkedCollection(current, uid)
              ? {
                  boards: current.boards.filter((b) => !goneIds.has(b.shareId)),
                }
              : null
          )
          .catch((err: unknown) =>
            logError('useLinkedCollectionSync.unlistGone', err, { linkId })
          );
        for (const s of gone) {
          await d.stopSharingBoard(s.shareId).catch(() => undefined);
        }
      }
    },
    [contextFor, importMissing]
  );

  /** Runs a job in the link's queue, after any sync work already in flight, and returns its result. */
  const runExclusive = useCallback(
    <T>(linkId: string, job: () => Promise<T>): Promise<T> => {
      const prev = queues.current.get(linkId) ?? Promise.resolve();
      const result = prev.then(job);
      queues.current.set(
        linkId,
        result.then(
          () => undefined,
          () => undefined
        )
      );
      return result;
    },
    []
  );

  /** Ends this teacher's copy: viewers lose the boards, everyone else keeps them as their own. */
  const closeLocally = useCallback(
    async (
      root: Collection,
      linkId: string,
      link?: LinkedCollection | null
    ) => {
      const d = depsRef.current;
      const boards = boardsOfLink(d, root, linkId, link);
      const ids = new Set(boards.map((b) => b.id));
      // Boards this session shared into the link that state may not show as linked yet.
      for (const [boardId, shareId] of sharedAs.current) {
        if (shareId.startsWith(`${linkId}_`)) ids.add(boardId);
      }
      ids.forEach((id) => leaving.current.add(id));
      const host = root.linkedCollectionRole === 'owner';
      try {
        if (root.linkedCollectionRole === 'viewer') {
          for (const id of ids) await d.deleteBoard(id);
          const tree = collectionTreeIds(root.id, d.collections);
          const othersLeft = depsRef.current.dashboards.some(
            (b) => tree.has(b.collectionId ?? '') && !ids.has(b.id)
          );
          // Their own boards moved in stay, so the collection does too.
          if (!othersLeft) {
            await d.collectionsApi.deleteCollection(root.id, 'delete-all');
            closedRoots.current.add(root.id);
            return;
          }
        } else {
          for (const id of ids) await d.setBoardLink(id, null);
        }
        await d.collectionsApi.setCollectionLink(root.id, {
          linkedCollectionId: linkId,
          linkedCollectionRole: root.linkedCollectionRole ?? 'viewer',
          linkedCollectionEnded: true,
        });
        closedRoots.current.add(root.id);
      } finally {
        // The host ends every listed board, including ones collaborators added; repeats are harmless.
        if (host) {
          const shareIds = new Set([
            ...(link?.boards ?? []).map((b) => b.shareId),
            ...boards.map((b) => b.linkedShareId ?? ''),
            ...[...sharedAs.current.values()].filter((id) =>
              id.startsWith(`${linkId}_`)
            ),
          ]);
          shareIds.delete('');
          const list = [...shareIds];
          for (let i = 0; i < list.length; i += BATCH) {
            const results = await Promise.allSettled(
              list.slice(i, i + BATCH).map((id) => d.stopSharingBoard(id))
            );
            results.forEach((r) => {
              if (r.status === 'rejected') {
                logError('useLinkedCollectionSync.stopBoard', r.reason, {
                  linkId,
                });
              }
            });
          }
        }
      }
    },
    []
  );

  /** The host ended the link, or this teacher is no longer in it. Runs in the link's queue. */
  const applyEnded = useCallback(
    async (linkId: string, link: LinkedCollection | null) => {
      const d = depsRef.current;
      if (!d.enabled || !d.uid || closing.current.has(linkId)) return;
      if (isLinkedCollectionImporting(linkId)) return;
      // A later snapshot may show the link live again for this teacher (a failed end, a re-join).
      const latest = linksRef.current.get(linkId);
      if (latest && !latest.ended && isLinkMember(latest, d.uid)) return;
      const root = d.collections.find(
        (c) =>
          isLiveLinkedRoot(c) &&
          c.linkedCollectionId === linkId &&
          !closedRoots.current.has(c.id)
      );
      if (!root) return;
      closing.current.add(linkId);
      try {
        await closeLocally(root, linkId, link ?? latest);
      } catch (err) {
        logError('useLinkedCollectionSync.ended', err, { linkId });
        return;
      } finally {
        closing.current.delete(linkId);
      }
      if (root.linkedCollectionRole === 'owner' || (link && !link.ended)) {
        return;
      }
      const hostName = link?.hostName?.trim();
      d.notify?.(
        hostName
          ? i18n.t('linkedCollection.hostStopped', {
              name: hostName,
              defaultValue: '{{name}} stopped sharing this collection.',
            })
          : i18n.t('linkedCollection.hostStoppedNoName', {
              defaultValue: 'The host stopped sharing this collection.',
            })
      );
    },
    [closeLocally]
  );

  /** Stop sharing (host) or Leave (member): the server write, then the local close in the link's queue. */
  const endOwnShare = useCallback(
    async (
      collectionId: string,
      asHost: boolean,
      write: (linkId: string, uid: string) => Promise<void>
    ): Promise<void> => {
      const d = depsRef.current;
      const uid = d.uid;
      if (!uid) throw new Error('Not authenticated');
      const root = d.collections.find((c) => c.id === collectionId);
      const linkId = root?.linkedCollectionId;
      if (!root || !linkId || !isLiveLinkedRoot(root)) return;
      if ((root.linkedCollectionRole === 'owner') !== asHost) {
        throw new Error(
          asHost
            ? 'Only the host can stop sharing'
            : 'The host stops sharing instead of leaving'
        );
      }
      // Set before the write, so queued sync work skips this link from here on.
      closing.current.add(linkId);
      try {
        try {
          await write(linkId, uid);
        } catch (err) {
          if (!isNotFound(err)) throw err;
        }
        await runExclusive(linkId, async () => {
          const now = depsRef.current;
          const link = linksRef.current.get(linkId);
          const current =
            now.collections.find((c) => c.id === collectionId) ?? root;
          if (!asHost) {
            // Boards this teacher added stay shared, so the others keep them.
            const joined = boardsOfLink(now, current, linkId, link)
              .filter((b) => b.linkedShareRole !== 'owner')
              .map((b) => b.linkedShareId ?? '');
            for (let i = 0; i < joined.length; i += BATCH) {
              await Promise.allSettled(
                joined.slice(i, i + BATCH).map((id) => now.leaveSharedBoard(id))
              );
            }
          }
          await closeLocally(current, linkId, link);
        });
      } finally {
        closing.current.delete(linkId);
      }
    },
    [closeLocally, runExclusive]
  );

  /** Host: Stop sharing. Synced members keep their copies; View-Only members lose theirs. */
  const stopSharingCollection = useCallback(
    (collectionId: string): Promise<void> =>
      endOwnShare(collectionId, true, (linkId, uid) =>
        depsRef.current.linkedCollectionApi.endLinkedCollection(linkId, uid)
      ),
    [endOwnShare]
  );

  /** Member: Leave shared collection. Synced members keep a copy; View-Only members don't. */
  const leaveSharedCollection = useCallback(
    (collectionId: string): Promise<void> =>
      endOwnShare(collectionId, false, async (linkId, uid) => {
        const link = linksRef.current.get(linkId);
        // Already out (an earlier Leave got this far): the rules would deny a second leave.
        if (link && !isLinkMember(link, uid)) return;
        await depsRef.current.linkedCollectionApi.leaveLinkedCollection(
          linkId,
          uid
        );
      }),
    [endOwnShare]
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
    const { linkedCollectionApi, uid: uidNow } = depsRef.current;
    if (!uidNow) return;
    const unsubs = linkIds.map((linkId) =>
      linkedCollectionApi.subscribeLinkedCollection(linkId, (link, meta) => {
        const next = new Map(linksRef.current);
        if (link) next.set(linkId, link);
        else next.delete(linkId);
        linksRef.current = next;
        setLinks(next);
        const fresh = !meta?.fromCache;
        if (link?.ended || (fresh && (!link || !isLinkMember(link, uidNow)))) {
          enqueue(linkId, () => applyEnded(linkId, link));
        } else if (link) {
          enqueue(linkId, () => applyRemote(linkId, fresh));
        }
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [rootKey, enqueue, applyRemote, applyEnded]);

  const { enabled, uid, dashboards, collections } = deps;
  // Local adds (new, duplicated or moved-in boards and sub-collections) and imports a snapshot couldn't finish.
  useEffect(() => {
    if (!enabled || !uid) return;
    for (const [linkId, link] of links) {
      if (scheduled.current.has(linkId) || closing.current.has(linkId))
        continue;
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

  /** Applies board-list edits, grouped by link. */
  const editEntries = useCallback(
    async (
      uid: string,
      targets: RemovalTarget[],
      removed?: Map<string, LinkedCollectionBoard[]>
    ) => {
      const byLink = new Map<string, RemovalTarget[]>();
      for (const t of targets) {
        byLink.set(t.linkId, [...(byLink.get(t.linkId) ?? []), t]);
      }
      for (const [linkId, list] of byLink) {
        const changes = new Map(list.map((t) => [t.shareId, t.change]));
        await depsRef.current.linkedCollectionApi.editLinkedCollection(
          linkId,
          uid,
          (current) => {
            if (!canEditLinkedCollection(current, uid)) return null;
            const dropped: LinkedCollectionBoard[] = [];
            const boards = current.boards.flatMap((b) => {
              const change = changes.get(b.shareId);
              if (!change) return [b];
              if (change.kind === 'remove') {
                dropped.push(b);
                return [];
              }
              const { sectionId: _old, ...rest } = b;
              return [
                change.sectionId
                  ? { ...rest, sectionId: change.sectionId }
                  : rest,
              ];
            });
            removed?.set(linkId, dropped);
            return { boards };
          }
        );
      }
    },
    []
  );

  /** Puts entries back on the list after a delete that didn't land. */
  const relistEntries = useCallback(
    async (uid: string, removed: Map<string, LinkedCollectionBoard[]>) => {
      for (const [linkId, entries] of removed) {
        if (entries.length === 0) continue;
        await depsRef.current.linkedCollectionApi.editLinkedCollection(
          linkId,
          uid,
          (current) => {
            if (!canEditLinkedCollection(current, uid)) return null;
            const listed = new Set(current.boards.map((b) => b.shareId));
            const back = entries.filter((e) => !listed.has(e.shareId));
            return back.length > 0
              ? { boards: [...current.boards, ...back] }
              : null;
          }
        );
      }
    },
    []
  );

  /**
   * Before a delete or move: edits the shared list where that must land first.
   * Call the result once the change is done, saying whether it landed.
   */
  const beforeBoardsLeave = useCallback(
    async (
      boardIds: string[],
      destination: BoardDestination
    ): Promise<(landed: boolean) => Promise<void>> => {
      const noop = () => Promise.resolve();
      const d = depsRef.current;
      if (!d.enabled || !d.uid) return noop;
      const uid = d.uid;
      if (destination.kind === 'delete') {
        for (const id of boardIds) {
          deletedBoards.current.add(id);
          const board = d.dashboards.find((b) => b.id === id);
          const shareId = board?.linkedShareId;
          // A board deleted locally from a shared collection isn't brought back by sync.
          if (board && shareId && linkedRootOf(board, d.collections)) {
            deletedLocally.current.add(shareId);
          }
        }
      }
      const targets = removalTargets(boardIds, destination);
      if (targets.length === 0) return noop;
      const removes = targets.filter((t) => t.change.kind === 'remove');
      removes.forEach((t) => leaving.current.add(t.board.id));
      // A delete leaves the list first. A move out lands first, so no tab ever sees an unlinked board inside the collection.
      const first =
        destination.kind === 'delete'
          ? targets
          : targets.filter((t) => t.change.kind === 'move');
      const later = destination.kind === 'delete' ? [] : removes;
      const removed = new Map<string, LinkedCollectionBoard[]>();
      try {
        if (first.length > 0) await editEntries(uid, first, removed);
      } catch (err) {
        removes.forEach((t) => leaving.current.delete(t.board.id));
        throw err;
      }
      return async (landed: boolean) => {
        try {
          if (!landed) {
            if (destination.kind !== 'delete') return;
            // The board is still here, so it stays listed and linked.
            for (const id of boardIds) deletedBoards.current.delete(id);
            for (const t of targets) deletedLocally.current.delete(t.shareId);
            try {
              await relistEntries(uid, removed);
            } catch (err) {
              logError('useLinkedCollectionSync.relist', err, {});
            }
            return;
          }
          if (later.length > 0) {
            try {
              await editEntries(uid, later);
            } catch (err) {
              // Still listed, so leave it linked: it keeps syncing from its new place.
              logError('useLinkedCollectionSync.unlist', err, {});
              return;
            }
          }
          for (const t of removes) {
            sharedAs.current.delete(t.board.id);
            try {
              if (t.board.linkedShareRole === 'owner') {
                await d.stopSharingBoard(t.shareId);
              } else {
                await d.leaveSharedBoard(t.shareId);
              }
              // A moved-out board stays with this teacher as their own board.
              if (destination.kind === 'move') {
                await d.setBoardLink(t.board.id, null);
              }
            } catch (err) {
              logError('useLinkedCollectionSync.detach', err, {
                shareId: t.shareId,
              });
            }
          }
        } finally {
          removes.forEach((t) => leaving.current.delete(t.board.id));
        }
      };
    },
    [removalTargets, editEntries, relistEntries]
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

  /** The shared collection this teacher can edit that holds a collection (or is it, when `orRoot`). */
  const editableLinkOf = useCallback(
    (collectionId: string | null, orRoot = false) => {
      const d = depsRef.current;
      if (!d.enabled || !d.uid || !collectionId) return null;
      const target = d.collections.find((c) => c.id === collectionId);
      if (!target || (!orRoot && isLiveLinkedRoot(target))) return null;
      const root = isLiveLinkedRoot(target)
        ? target
        : linkedRootOf({ collectionId: target.id }, d.collections);
      const linkId = root?.linkedCollectionId;
      const link = linkId ? linksRef.current.get(linkId) : undefined;
      if (!root || !linkId || !link || !canEditLinkedCollection(link, d.uid)) {
        return null;
      }
      return { d, uid: d.uid, target, root, linkId };
    },
    []
  );

  /** Boards a sub-collection move would take out of the shared collection for everyone. */
  const collectionMoveRemovals = useCallback(
    (collectionId: string, destination: string | null) => {
      const ctx = editableLinkOf(collectionId);
      if (!ctx) return null;
      const { d, root } = ctx;
      if (collectionTreeIds(root.id, d.collections).has(destination ?? '')) {
        return null;
      }
      const inside = collectionTreeIds(collectionId, d.collections);
      const boardIds = d.dashboards
        .filter((b) => inside.has(b.collectionId ?? ''))
        .map((b) => b.id);
      return { ctx, boardIds };
    },
    [editableLinkOf]
  );

  /** How many boards moving this collection would remove for everyone (for the confirm). */
  const countCollectionMoveRemovals = useCallback(
    (collectionId: string, destination: string | null): number => {
      const out = collectionMoveRemovals(collectionId, destination);
      return out
        ? removalTargets(out.boardIds, {
            kind: 'move',
            collectionId: destination,
          }).length
        : 0;
    },
    [collectionMoveRemovals, removalTargets]
  );

  /** Moves a collection and carries the change to the shared collection it leaves, moves in or joins. */
  const moveCollectionSynced = useCallback(
    async (
      collectionId: string,
      destination: string | null,
      move: () => Promise<void>
    ): Promise<void> => {
      const d = depsRef.current;
      const into = editableLinkOf(destination, true);
      const keysMoving = subtreeSectionKeys(collectionId, d.collections);
      /** A sub-collection once removed from the destination may be listed there again. */
      const relist = (linkId: string, uid: string) =>
        d.linkedCollectionApi.editLinkedCollection(linkId, uid, (current) => {
          if (!canEditLinkedCollection(current, uid)) return null;
          const was = current.deletedSections ?? [];
          const next = was.filter((k) => !keysMoving.has(k));
          return next.length === was.length ? null : { deletedSections: next };
        });
      const out = collectionMoveRemovals(collectionId, destination);
      if (out) {
        if (into) {
          await relist(into.linkId, into.uid).catch((err: unknown) =>
            logError('useLinkedCollectionSync.relistSection', err, {})
          );
        }
        // Out of the shared collection: its boards leave for everyone, the mover keeps them.
        const { d, uid, target, linkId } = out.ctx;
        const moving = collectionTreeIds(collectionId, d.collections);
        moving.forEach((id) => settlingCollections.current.add(id));
        try {
          const finish = await beforeBoardsLeave(out.boardIds, {
            kind: 'move',
            collectionId: destination,
          });
          let landed = false;
          try {
            await move();
            landed = true;
          } finally {
            await finish(landed);
          }
          const key = sectionKey(target);
          const localKeys = subtreeSectionKeys(collectionId, d.collections);
          await d.linkedCollectionApi
            .editLinkedCollection(linkId, uid, (current) => {
              if (!canEditLinkedCollection(current, uid)) return null;
              const keys = new Set([
                ...localKeys,
                ...linkedSubtreeKeys(current.sections ?? [], key),
              ]);
              return sectionsAfterRemove(current, keys);
            })
            .catch((err: unknown) =>
              logError('useLinkedCollectionSync.unlistSection', err, { linkId })
            );
        } finally {
          moving.forEach((id) => settlingCollections.current.delete(id));
        }
        return;
      }
      const from = editableLinkOf(collectionId);
      if (into && into.root.id !== from?.root.id) {
        await runQueued(into.linkId, async () => {
          await relist(into.linkId, into.uid).catch((err: unknown) =>
            logError('useLinkedCollectionSync.relistSection', err, {})
          );
          await move();
        });
        return;
      }
      // A move into itself or a child is refused by move() before the list changes.
      if (
        !from ||
        into?.root.id !== from.root.id ||
        collectionTreeIds(collectionId, d.collections).has(destination ?? '')
      ) {
        return move();
      }
      const { uid, target, root, linkId } = from;
      const dest = d.collections.find((c) => c.id === destination);
      const parentKey = dest && dest.id !== root.id ? sectionKey(dest) : null;
      const key = sectionKey(target);
      // The list changes first, so other tabs never put it back where it was.
      await runQueued(linkId, async () => {
        settlingCollections.current.add(collectionId);
        try {
          // Offline or refused, the move still happens here; the next snapshot settles it.
          await d.linkedCollectionApi
            .editLinkedCollection(linkId, uid, (current) => {
              if (!canEditLinkedCollection(current, uid)) return null;
              const sections = sectionsAfterMove(
                current.sections ?? [],
                key,
                parentKey
              );
              return sections ? { sections } : null;
            })
            .catch((err: unknown) =>
              logError('useLinkedCollectionSync.moveSection', err, { linkId })
            );
          await move();
        } finally {
          settlingCollections.current.delete(collectionId);
        }
      });
    },
    [collectionMoveRemovals, editableLinkOf, beforeBoardsLeave, runQueued]
  );

  /** Deletes a collection and, inside a shared collection, for everyone; its boards move to its parent. */
  const deleteCollectionSynced = useCallback(
    async (
      collectionId: string,
      mode: DeleteCollectionMode,
      remove: () => Promise<void>
    ): Promise<void> => {
      const ctx = editableLinkOf(collectionId);
      if (!ctx) return remove();
      const { uid, linkId } = ctx;
      // The list changes first: a delete that then fails here is finished by the next snapshot.
      await runQueued(linkId, async () => {
        // Read now, not at the click: an earlier queued delete may have changed the tree.
        const d = depsRef.current;
        const target = d.collections.find((c) => c.id === collectionId);
        if (!target) return remove();
        const key = sectionKey(target);
        const localKeys =
          mode === 'delete-all'
            ? subtreeSectionKeys(collectionId, d.collections)
            : new Set([key]);
        const ids =
          mode === 'delete-all'
            ? collectionTreeIds(collectionId, d.collections)
            : new Set([collectionId]);
        ids.forEach((id) => settlingCollections.current.add(id));
        try {
          await d.linkedCollectionApi
            .editLinkedCollection(linkId, uid, (current) => {
              if (!canEditLinkedCollection(current, uid)) return null;
              const keys =
                mode === 'delete-all'
                  ? new Set([
                      ...localKeys,
                      ...linkedSubtreeKeys(current.sections ?? [], key),
                    ])
                  : localKeys;
              return sectionsAfterRemove(current, keys);
            })
            .catch((err: unknown) =>
              logError('useLinkedCollectionSync.deleteSection', err, { linkId })
            );
          await remove();
        } catch (err) {
          ids.forEach((id) => settlingCollections.current.delete(id));
          throw err;
        }
      });
    },
    [editableLinkOf, runQueued]
  );

  /** Before a local rename lands: keeps snapshots from putting the old name back meanwhile. */
  const holdBoardName = useCallback((boardId: string, name: string) => {
    pendingRenames.current.set(boardId, { name, written: false });
    return () => {
      if (pendingRenames.current.get(boardId)?.written === false) {
        pendingRenames.current.delete(boardId);
      }
    };
  }, []);

  /** After a local rename: carries a board's new name to the shared collection when this teacher can edit it. */
  const pushBoardName = useCallback(async (boardId: string, name: string) => {
    const d = depsRef.current;
    const release = () => pendingRenames.current.delete(boardId);
    if (!d.enabled || !d.uid) return void release();
    const uid = d.uid;
    const board = d.dashboards.find((b) => b.id === boardId);
    const shareId = board && liveShareIdOf(board);
    const linkId =
      board && linkedRootOf(board, d.collections)?.linkedCollectionId;
    const link = linkId ? linksRef.current.get(linkId) : undefined;
    if (
      !board ||
      !shareId ||
      !linkId ||
      !link ||
      !canEditLinkedCollection(link, uid)
    ) {
      return void release();
    }
    const listedName = safeName(name, board.name);
    pendingRenames.current.set(boardId, { name: listedName, written: false });
    try {
      const listed = await d.linkedCollectionApi.editLinkedCollection(
        linkId,
        uid,
        (current) => {
          if (!canEditLinkedCollection(current, uid)) return null;
          const entry = current.boards.find((b) => b.shareId === shareId);
          if (!entry || entry.name === listedName) return null;
          return {
            boards: current.boards.map((b) =>
              b.shareId === shareId ? { ...b, name: listedName } : b
            ),
          };
        }
      );
      const pending = pendingRenames.current.get(boardId);
      if (!listed) release();
      else if (pending?.name === listedName) pending.written = true;
    } catch (err) {
      release();
      logError('useLinkedCollectionSync.rename', err, { linkId });
    }
  }, []);

  return {
    links,
    countCollectionMoveRemovals,
    moveCollectionSynced,
    deleteCollectionSynced,
    holdBoardName,
    pushBoardName,
    countRemovedForEveryone,
    beforeBoardsLeave,
    pushCollectionMetadata,
    stopSharingCollection,
    leaveSharedCollection,
  };
};
