// Recipient side of a Synced / View-Only collection share: `/share/collection/{linkId}` (COLLECTION_SHARING.md slice 3).

import { useCallback } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useFirestore, type SharedBoardSnapshot } from '@/hooks/useFirestore';
import { useLinkedCollection } from '@/hooks/useLinkedCollection';
import { logError } from '@/utils/logError';
import {
  beginLinkedCollectionImport,
  endLinkedCollectionImport,
} from '@/utils/linkedCollectionImportLock';
import {
  linkedBoardFromShare,
  orderSectionsParentsFirst,
  safeName,
  safeStyleValue,
  sharedBoardBelongsToLink,
  uniqueLinkedBoards,
} from '@/utils/linkedCollectionImport';
import type { LinkedCollection, LinkedCollectionBoard } from '@/types';

export type LinkedCollectionImportResult =
  | {
      ok: true;
      collectionId: string;
      firstBoardId: string | null;
      imported: number;
      failed: number;
    }
  | { ok: false; reason: 'ended' | 'denied' | 'error' };

const BOARD_BATCH = 10;

const isPermissionDenied = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  (err as { code?: unknown }).code === 'permission-denied';

export const useLinkedCollectionImport = () => {
  const { user } = useAuth();
  const { collectionsApi, createNewDashboard, dashboards } = useDashboard();
  const { loadSharedDashboard, joinSharedBoard } = useFirestore(
    user?.uid ?? null
  );
  const { joinLinkedCollection } = useLinkedCollection();

  /** This teacher's live local copy of the link, if they already have one (host included). */
  const findLocalCollection = useCallback(
    (linkId: string) =>
      collectionsApi.collections.find(
        (c) =>
          c.linkedCollectionId === linkId &&
          !c.linkedCollectionEnded &&
          c.parentCollectionId === null
      ) ??
      collectionsApi.collections.find(
        (c) => c.linkedCollectionId === linkId && !c.linkedCollectionEnded
      ),
    [collectionsApi.collections]
  );

  /** First board to open in a local collection: its default, else its first board by order. */
  const firstBoardIn = useCallback(
    (collectionId: string): string | null => {
      const target = collectionsApi.collections.find(
        (c) => c.id === collectionId
      );
      if (
        target?.defaultBoardId &&
        dashboards.some((d) => d.id === target.defaultBoardId)
      ) {
        return target.defaultBoardId;
      }
      const inside = dashboards
        .filter((d) => d.collectionId === collectionId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return inside[0]?.id ?? null;
    },
    [collectionsApi.collections, dashboards]
  );

  const importLinkedCollection = useCallback(
    async (link: LinkedCollection): Promise<LinkedCollectionImportResult> => {
      if (!user) return { ok: false, reason: 'error' };
      if (link.ended) return { ok: false, reason: 'ended' };
      const isHost = link.hostUid === user.uid;
      const role = link.mode === 'synced' ? 'collaborator' : 'viewer';
      const displayName = user.displayName ?? user.email ?? undefined;

      // Join the link first: a removed member or a closed link stops here, before any local writes.
      if (!isHost && !(user.uid in link.participants)) {
        try {
          await joinLinkedCollection(link, user.uid, displayName);
        } catch (err) {
          if (isPermissionDenied(err)) return { ok: false, reason: 'denied' };
          logError('useLinkedCollectionImport.join', err, {
            linkId: link.linkId,
          });
          return { ok: false, reason: 'error' };
        }
      }

      beginLinkedCollectionImport(link.linkId);
      try {
        // Read and verify every listed share before writing anything locally.
        // Boards already mirrored locally (e.g. imported one by one before) aren't copied twice.
        const localShares = new Set(
          dashboards
            .filter((d) => d.linkedShareId && !d.linkedShareEnded)
            .map((d) => d.linkedShareId)
        );
        const entries = uniqueLinkedBoards(link.boards).filter(
          (e) => !localShares.has(e.shareId)
        );
        const verified: {
          entry: LinkedCollectionBoard;
          snap: SharedBoardSnapshot;
        }[] = [];
        let failed = 0;
        for (let i = 0; i < entries.length; i += BOARD_BATCH) {
          const batch = entries.slice(i, i + BOARD_BATCH);
          const loaded = await Promise.allSettled(
            batch.map((entry) => loadSharedDashboard(entry.shareId))
          );
          loaded.forEach((r, offset) => {
            // Trust rule: boards[] is collaborator-written, so the share doc must name this link.
            if (
              r.status === 'fulfilled' &&
              r.value &&
              sharedBoardBelongsToLink(r.value, link)
            ) {
              verified.push({ entry: batch[offset], snap: r.value });
            } else {
              failed += 1;
            }
          });
        }
        if (entries.length > 0 && verified.length === 0) {
          return { ok: false, reason: 'error' };
        }

        const rootName = safeName(link.name, 'Shared collection');
        const rootId = await collectionsApi.createCollection(rootName, null, {
          color: safeStyleValue(link.color),
          icon: safeStyleValue(link.icon),
          linkedCollectionId: link.linkId,
          linkedCollectionRole: isHost ? 'owner' : role,
        });

        const sectionToLocal = new Map<string, string>();
        const sections = orderSectionsParentsFirst(link.sections ?? []);
        for (const [index, section] of sections.entries()) {
          const parentLocal =
            (section.parentId
              ? sectionToLocal.get(section.parentId)
              : undefined) ?? rootId;
          const localId = await collectionsApi.createCollection(
            safeName(section.name, rootName),
            parentLocal,
            {
              color: section.color,
              order: index,
              linkedSectionId: section.id,
            }
          );
          sectionToLocal.set(section.id, localId);
        }

        const baseOrder = dashboards.reduce(
          (max, d) => Math.max(max, d.order ?? 0),
          0
        );
        const created: { shareId: string; boardId: string; top: boolean }[] =
          [];
        for (let i = 0; i < verified.length; i += BOARD_BATCH) {
          const batch = verified.slice(i, i + BOARD_BATCH);
          const results = await Promise.allSettled(
            batch.map(async ({ entry, snap }, offset) => {
              const ownsBoard = snap.originalAuthor === user.uid;
              const localSection = entry.sectionId
                ? sectionToLocal.get(entry.sectionId)
                : undefined;
              const data = linkedBoardFromShare(entry, snap, {
                uid: user.uid,
                role,
                fallbackName: rootName,
                order: baseOrder + i + offset + 1,
              });
              const boardId = await createNewDashboard(data.name, data, {
                collectionId: localSection ?? rootId,
                silent: true,
              });
              if (!boardId) throw new Error('Board was not saved');
              try {
                if (!ownsBoard && !snap.participants?.[user.uid]) {
                  await joinSharedBoard(entry.shareId, role, displayName);
                }
              } catch (joinErr) {
                logError('useLinkedCollectionImport.joinBoard', joinErr, {
                  linkId: link.linkId,
                  shareId: entry.shareId,
                });
              }
              return { shareId: entry.shareId, boardId, top: !localSection };
            })
          );
          for (const r of results) {
            if (r.status === 'fulfilled') created.push(r.value);
            else failed += 1;
          }
        }

        const landing = created.find((c) => c.top) ?? created[0];
        return {
          ok: true,
          collectionId: rootId,
          firstBoardId: landing?.boardId ?? null,
          imported: created.length,
          failed,
        };
      } catch (err) {
        logError('useLinkedCollectionImport.import', err, {
          linkId: link.linkId,
        });
        return { ok: false, reason: 'error' };
      } finally {
        endLinkedCollectionImport(link.linkId);
      }
    },
    [
      user,
      collectionsApi,
      dashboards,
      createNewDashboard,
      loadSharedDashboard,
      joinSharedBoard,
      joinLinkedCollection,
    ]
  );

  return { findLocalCollection, firstBoardIn, importLinkedCollection };
};
