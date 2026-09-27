/**
 * useSubShares — the teacher's live sub shares and the four things they do with
 * one: copy the link, push the current boards, add a week, end it now
 * (docs/plans/shipped/SUB_SHARE_COLLECTIONS.md §3.7).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { logError } from '@/utils/logError';
import {
  collectShareRosterIds,
  flattenSharedCollection,
  singleBoardTree,
} from '@/utils/subShareSnapshot';
import type {
  Collection,
  SharedCollection,
  SubstituteShareRoster,
} from '@/types';

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SUB_EXPIRATION_MS = 14 * 24 * 60 * 60 * 1000;

export interface SubSharesApi {
  shares: SharedCollection[];
  busyShareId: string | null;
  /** The end time of the live sub share of this Board or Collection, if any. */
  endsAtFor: (sourceId: string) => number | null;
  refresh: () => void;
  copyLink: (share: SharedCollection) => void;
  updateNow: (share: SharedCollection) => void;
  extend: (share: SharedCollection) => void;
  end: (share: SharedCollection) => void;
}

export function useSubShares(enabled: boolean): SubSharesApi {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const {
    dashboards,
    collectionsApi,
    rosters,
    activeRosterId,
    addToast,
    listSubstituteCollectionShares,
    updateSubstituteCollectionShare,
    extendSubstituteCollectionShare,
    endSubstituteCollectionShare,
  } = useDashboard();

  const [shares, setShares] = useState<SharedCollection[]>([]);
  const [busyShareId, setBusyShareId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const live = await listSubstituteCollectionShares();
        if (!cancelled) setShares(live);
      } catch (err) {
        logError('useSubShares.load', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, listSubstituteCollectionShares, reloadKey]);

  const refresh = useCallback(() => setReloadKey((n) => n + 1), []);

  const endsAtBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const share of shares) {
      if (share.sourceId && share.expiresAt) {
        // Keep the latest end time if two live shares ever share a source.
        const existing = map.get(share.sourceId);
        if (existing === undefined || share.expiresAt > existing) {
          map.set(share.sourceId, share.expiresAt);
        }
      }
    }
    return map;
  }, [shares]);

  const endsAtFor = useCallback(
    (sourceId: string) => endsAtBySource.get(sourceId) ?? null,
    [endsAtBySource]
  );

  const copyLink = useCallback(
    (share: SharedCollection) => {
      const url = `${window.location.origin}/subs/s/${share.shareId}`;
      void (async () => {
        try {
          await navigator.clipboard.writeText(url);
          addToast(
            t('subShare.panel.copied', { defaultValue: 'Link copied' }),
            'success'
          );
        } catch (err) {
          logError('useSubShares.copyLink', err, { shareId: share.shareId });
          addToast(
            t('subShare.panel.copyFailed', {
              url,
              defaultValue: 'Copy this link by hand: {{url}}',
            }),
            'error'
          );
        }
      })();
    },
    [addToast, t]
  );

  const updateNow = useCallback(
    (share: SharedCollection) => {
      void (async () => {
        const sourceId = share.sourceId;
        const board =
          share.kind === 'board'
            ? dashboards.find((d) => d.id === sourceId)
            : undefined;
        const collection =
          share.kind === 'board'
            ? undefined
            : collectionsApi.collections.find((c) => c.id === sourceId);
        if (!board && !collection) {
          addToast(
            t('subShare.panel.sourceGone', {
              defaultValue:
                'The boards behind this share are gone. End it and share again.',
            }),
            'error'
          );
          return;
        }

        const tree = board
          ? singleBoardTree(board)
          : flattenSharedCollection(
              collection as Collection,
              collectionsApi.collections,
              dashboards
            );
        if (tree.orderedBoards.length === 0) {
          addToast(
            t('subShare.panel.nowEmpty', {
              defaultValue:
                'This collection has no boards left to share. End the share instead.',
            }),
            'error'
          );
          return;
        }

        // Re-resolve rosters from the current boards so a class list the
        // teacher added since the last push reaches the same subs.
        const rosterIds = collectShareRosterIds(
          tree.orderedBoards,
          activeRosterId
        );
        const sharedRosters: SubstituteShareRoster[] = rosters
          .filter((r) => rosterIds.includes(r.id) && r.driveFileId)
          .map((r) => ({
            id: r.id,
            name: r.name,
            driveFileId: r.driveFileId as string,
          }));
        const shareCollection: Collection = collection ?? {
          id: (board as { id: string }).id,
          name: (board as { name: string }).name,
          parentCollectionId: null,
          order: 0,
          createdAt: share.createdAt,
        };
        const defaultBoardId = collection?.defaultBoardId ?? tree.boards[0]?.id;

        setBusyShareId(share.shareId);
        try {
          await updateSubstituteCollectionShare({
            shareId: share.shareId,
            collection: shareCollection,
            boards: tree.orderedBoards,
            kind: share.kind ?? 'collection',
            sections: tree.sections,
            boardEntries: tree.boards,
            ...(defaultBoardId !== undefined && { defaultBoardId }),
            ...(share.subEmails && share.subEmails.length > 0
              ? { subEmails: share.subEmails }
              : {}),
            // Always stated, so a roster no board references any more is
            // dropped from the share instead of reading as "unchanged".
            sharedRosters,
          });
          addToast(
            t('subShare.panel.updated', {
              defaultValue: 'Your sub now sees the current boards',
            }),
            'success'
          );
          refresh();
        } catch (err) {
          logError('useSubShares.updateNow', err, { shareId: share.shareId });
          addToast(
            t('subShare.panel.updateFailed', {
              defaultValue: 'Could not update the share. Try again.',
            }),
            'error'
          );
        } finally {
          setBusyShareId(null);
        }
      })();
    },
    [
      dashboards,
      collectionsApi.collections,
      rosters,
      activeRosterId,
      updateSubstituteCollectionShare,
      addToast,
      refresh,
      t,
    ]
  );

  const extend = useCallback(
    (share: SharedCollection) => {
      void (async () => {
        const cap = Date.now() + MAX_SUB_EXPIRATION_MS;
        const next = Math.min((share.expiresAt ?? Date.now()) + WEEK_MS, cap);
        // Under an hour of extra time is not worth a write the teacher would
        // read as "Add a week" having worked.
        if (next - (share.expiresAt ?? 0) < HOUR_MS) {
          addToast(
            t('subShare.panel.atCap', {
              defaultValue: 'A sub share can run for at most 14 days.',
            }),
            'info'
          );
          return;
        }
        setBusyShareId(share.shareId);
        try {
          await extendSubstituteCollectionShare(share.shareId, next);
          addToast(
            t('subShare.panel.extended', {
              date: new Date(next).toLocaleDateString(),
              defaultValue: 'Share now runs until {{date}}',
            }),
            'success'
          );
          refresh();
        } catch (err) {
          logError('useSubShares.extend', err, { shareId: share.shareId });
          addToast(
            t('subShare.panel.extendFailed', {
              defaultValue: 'Could not change the end time. Try again.',
            }),
            'error'
          );
        } finally {
          setBusyShareId(null);
        }
      })();
    },
    [extendSubstituteCollectionShare, addToast, refresh, t]
  );

  const end = useCallback(
    (share: SharedCollection) => {
      void (async () => {
        const ok = await showConfirm(
          t('subShare.panel.endConfirm', {
            name: share.collection.name,
            defaultValue:
              'End the sub share of {{name}} now? Your sub loses the boards and your class lists right away.',
          }),
          {
            title: t('subShare.panel.end', { defaultValue: 'End now' }),
            variant: 'danger',
            confirmLabel: t('subShare.panel.end', { defaultValue: 'End now' }),
          }
        );
        if (!ok) return;
        setBusyShareId(share.shareId);
        try {
          await endSubstituteCollectionShare(share.shareId);
          addToast(
            t('subShare.panel.ended', { defaultValue: 'Sub share ended' }),
            'success'
          );
          refresh();
        } catch (err) {
          logError('useSubShares.end', err, { shareId: share.shareId });
          addToast(
            t('subShare.panel.endFailed', {
              defaultValue: 'Could not end the share. Try again.',
            }),
            'error'
          );
        } finally {
          setBusyShareId(null);
        }
      })();
    },
    [endSubstituteCollectionShare, showConfirm, addToast, refresh, t]
  );

  return {
    shares,
    busyShareId,
    endsAtFor,
    refresh,
    copyLink,
    updateNow,
    extend,
    end,
  };
}
