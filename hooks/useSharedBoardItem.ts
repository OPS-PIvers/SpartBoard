// Live read-only copies of library items on Synced and View-Only boards, read by members and written by the item's owner.

import { use, useEffect, useEffectEvent, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/context/useAuth';
import { BoardLinkedShareContext } from '@/context/boardLinkedShare';
import { logError } from '@/utils/logError';
import {
  publishSharedBoardItem,
  sharedBoardItemDocId,
  sharedBoardItemRef,
  type SharedBoardItemDoc,
  type SharedBoardItemKind,
} from '@/utils/sharedBoardItems';

/**
 * - `off`: not a live shared board, or no item asked for.
 * - `pending`: the first snapshot has not answered yet.
 * - `foreign`: another member published this item; render it read-only.
 * - `none`: no copy, or the copy is the viewer's own.
 */
export type SharedBoardItemStatus = 'off' | 'pending' | 'foreign' | 'none';

export interface SharedBoardItemState<T> {
  status: SharedBoardItemStatus;
  item: SharedBoardItemDoc<T> | null;
}

const OFF = { status: 'off', item: null } as const;

/** The widget's own board's live share; null off a board canvas, where nothing is shared. */
function useOwnBoardShareId(): string | null {
  return use(BoardLinkedShareContext) ?? null;
}

/** Another member's copy of `itemId`; pass null when the viewer's own library has it. */
export function useSharedBoardItem<T>(
  kind: SharedBoardItemKind,
  itemId: string | null | undefined
): SharedBoardItemState<T> {
  const { user } = useAuth();
  const shareId = useOwnBoardShareId();
  const uid = user?.uid ?? null;
  const key =
    shareId && itemId && uid
      ? `${shareId}/${sharedBoardItemDocId(kind, itemId)}`
      : null;

  const [snapshot, setSnapshot] = useState<{
    key: string;
    item: SharedBoardItemDoc<T> | null;
  } | null>(null);

  useEffect(() => {
    if (!key || !shareId || !itemId) return undefined;
    return onSnapshot(
      sharedBoardItemRef(shareId, kind, itemId),
      (snap) => {
        setSnapshot({
          key,
          item: snap.exists() ? (snap.data() as SharedBoardItemDoc<T>) : null,
        });
      },
      (err) => {
        // Denied once the viewer leaves the share or the share ends.
        if ((err as { code?: string }).code !== 'permission-denied') {
          logError('useSharedBoardItem', err, { kind, itemId });
        }
        setSnapshot({ key, item: null });
      }
    );
  }, [key, shareId, kind, itemId]);

  if (!key) return OFF;
  if (!snapshot || snapshot.key !== key)
    return { status: 'pending', item: null };
  const item = snapshot.item;
  return item && item.ownerUid !== uid && item.kind === kind
    ? { status: 'foreign', item }
    : { status: 'none', item: null };
}

const published = new Set<string>();

export interface SharedBoardItemPublish<T> {
  kind: SharedBoardItemKind;
  /** Null when the widget shows no item of the viewer's own. */
  itemId: string | null | undefined;
  title: string;
  /** Changes whenever the payload would; null while unknown. */
  version: string | null | undefined;
  build: () => Promise<T>;
}

/** Keeps the owner's copy of the widget's open item current for the board's other members. */
export function useSharedBoardItemPublisher<T>({
  kind,
  itemId,
  title,
  version,
  build,
}: SharedBoardItemPublish<T>): void {
  const { user, canAccessFeature } = useAuth();
  const shareId = useOwnBoardShareId();
  const uid = user?.uid ?? null;
  const enabled =
    !!shareId &&
    !!uid &&
    !!itemId &&
    !!version &&
    canAccessFeature('shared-board-live-walls');
  const key = enabled
    ? `${shareId}/${sharedBoardItemDocId(kind, itemId)}@${version}`
    : null;

  const publish = useEffectEvent(
    (target: string, ownerUid: string, id: string, ver: string) =>
      publishSharedBoardItem(
        target,
        { kind, itemId: id, ownerUid, title, version: ver },
        build
      )
  );

  useEffect(() => {
    if (!key || !shareId || !uid || !itemId || !version) return;
    if (published.has(key)) return;
    published.add(key);
    publish(shareId, uid, itemId, version).catch((err: unknown) => {
      published.delete(key);
      logError('useSharedBoardItemPublisher', err, { kind, itemId });
    });
  }, [key, shareId, uid, kind, itemId, version]);
}

/** Test hook: forget which copies this tab already wrote. */
export function resetSharedBoardItemPublishes(): void {
  published.clear();
}
