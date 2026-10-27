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
 * - `off`: not a live shared board, no item, or the item is the viewer's own.
 * - `pending`: the first snapshot has not answered yet.
 * - `foreign`: another member published this item; render it read-only.
 * - `none`: no copy has been published.
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

/** `ownerUid`'s copy of `itemId`, as stamped in widget config; off when the viewer is the owner. */
export function useSharedBoardItem<T>(
  kind: SharedBoardItemKind,
  ownerUid: string | null | undefined,
  itemId: string | null | undefined
): SharedBoardItemState<T> {
  const { user } = useAuth();
  const shareId = useOwnBoardShareId();
  const uid = user?.uid ?? null;
  const key =
    shareId && itemId && ownerUid && uid && ownerUid !== uid
      ? `${shareId}/${sharedBoardItemDocId(kind, ownerUid, itemId)}`
      : null;

  const [snapshot, setSnapshot] = useState<{
    key: string;
    item: SharedBoardItemDoc<T> | null;
  } | null>(null);

  useEffect(() => {
    if (!key || !shareId || !ownerUid || !itemId) return undefined;
    return onSnapshot(
      sharedBoardItemRef(shareId, kind, ownerUid, itemId),
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
  }, [key, shareId, kind, ownerUid, itemId]);

  if (!key) return OFF;
  if (!snapshot || snapshot.key !== key)
    return { status: 'pending', item: null };
  const item = snapshot.item;
  return item && item.ownerUid === ownerUid && item.kind === kind
    ? { status: 'foreign', item }
    : { status: 'none', item: null };
}

// Last version this tab wrote per item; a revert to an older version must write again.
const published = new Map<string, string>();

export interface SharedBoardItemPublish<T> {
  kind: SharedBoardItemKind;
  /** Null when the widget shows no item of the viewer's own. */
  itemId: string | null | undefined;
  title: string;
  /** Changes whenever the payload would; null while unknown. */
  version: string | null | undefined;
  build: () => Promise<T>;
  /** The owner uid the widget config names now. */
  stampedOwnerUid: string | null | undefined;
  /** Names the viewer as owner in the widget config, so members find this copy. */
  stampOwner: (uid: string) => void;
}

/** Keeps the owner's copy of the widget's open item current for the board's other members. */
export function useSharedBoardItemPublisher<T>({
  kind,
  itemId,
  title,
  version,
  build,
  stampedOwnerUid,
  stampOwner,
}: SharedBoardItemPublish<T>): void {
  const { user } = useAuth();
  const shareId = useOwnBoardShareId();
  const uid = user?.uid ?? null;
  const enabled = !!shareId && !!uid && !!itemId && !!version;
  const key =
    enabled && uid && itemId
      ? `${shareId}/${sharedBoardItemDocId(kind, uid, itemId)}`
      : null;
  const needsStamp = enabled && !!uid && stampedOwnerUid !== uid;

  const publish = useEffectEvent(
    (target: string, ownerUid: string, id: string, ver: string) =>
      publishSharedBoardItem(
        target,
        { kind, itemId: id, ownerUid, title, version: ver },
        build
      )
  );
  const stamp = useEffectEvent((ownerUid: string) => stampOwner(ownerUid));

  useEffect(() => {
    if (needsStamp && uid) stamp(uid);
  }, [needsStamp, uid]);

  useEffect(() => {
    if (!key || !shareId || !uid || !itemId || !version) return;
    if (published.get(key) === version) return;
    published.set(key, version);
    publish(shareId, uid, itemId, version).catch((err: unknown) => {
      if (published.get(key) === version) published.delete(key);
      logError('useSharedBoardItemPublisher', err, { kind, itemId });
    });
  }, [key, shareId, uid, kind, itemId, version]);
}

/** Test hook: forget which copies this tab already wrote. */
export function resetSharedBoardItemPublishes(): void {
  published.clear();
}
