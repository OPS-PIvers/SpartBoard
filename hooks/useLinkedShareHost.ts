// Who hosts a Synced or View-Only board share, and its members' names, read once per share id.

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

interface ShareInfo {
  hostUid: string | null;
  /** Display names by uid: the host's and each participant's that has one (never an email). */
  names: Record<string, string>;
}

const EMPTY_INFO: ShareInfo = { hostUid: null, names: {} };

const infoByShareId = new Map<string, Promise<ShareInfo>>();
const reread = new Set<string>();

// Names fall back to the email when an account has no display name; never show one on a board.
const displayable = (name: unknown): string | null =>
  typeof name === 'string' && name.trim() && !name.includes('@')
    ? name.trim()
    : null;

const readShareInfo = (data: Record<string, unknown> | undefined) => {
  const author = data?.originalAuthor;
  const hostUid = typeof author === 'string' && author ? author : null;
  const names: Record<string, string> = {};
  const participants = data?.participants;
  if (participants && typeof participants === 'object') {
    for (const [uid, entry] of Object.entries(participants)) {
      const name = displayable(
        (entry as { displayName?: unknown } | null)?.displayName
      );
      if (name) names[uid] = name;
    }
  }
  const hostName = displayable(data?.originalAuthorName);
  if (hostUid && hostName) names[hostUid] = hostName;
  return { hostUid, names };
};

const loadShareInfo = (shareId: string, fresh = false): Promise<ShareInfo> => {
  let pending = fresh ? undefined : infoByShareId.get(shareId);
  if (!pending) {
    pending = getDoc(doc(db, 'shared_boards', shareId))
      .then((snap) => readShareInfo(snap.data()))
      .catch((err: unknown) => {
        infoByShareId.delete(shareId);
        console.error('[useLinkedShareHost] Could not read the share:', err);
        return EMPTY_INFO;
      });
    infoByShareId.set(shareId, pending);
  }
  return pending;
};

/** The share's `originalAuthor` uid, or null while loading, unreadable or when `shareId` is null. */
export function useLinkedShareHost(shareId: string | null): string | null {
  const [resolved, setResolved] = useState<{
    shareId: string;
    hostUid: string | null;
  } | null>(null);

  useEffect(() => {
    if (!shareId) return undefined;
    let cancelled = false;
    void loadShareInfo(shareId).then(({ hostUid }) => {
      if (!cancelled) setResolved({ shareId, hostUid });
    });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  return shareId && resolved?.shareId === shareId ? resolved.hostUid : null;
}

/** `uid`'s display name on the share, or null while loading or when it has none. */
export function useLinkedShareMemberName(
  shareId: string | null,
  uid: string | null
): string | null {
  const key = shareId && uid ? `${shareId}|${uid}` : null;
  const [resolved, setResolved] = useState<{
    key: string;
    name: string | null;
  } | null>(null);

  useEffect(() => {
    if (!key || !shareId || !uid) return undefined;
    let cancelled = false;
    void (async () => {
      let info = await loadShareInfo(shareId);
      // Someone who joined after the share was first read: read it again, once per session.
      if (!(uid in info.names) && !reread.has(key)) {
        reread.add(key);
        info = await loadShareInfo(shareId, true);
      }
      if (!cancelled) setResolved({ key, name: info.names[uid] ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, shareId, uid]);

  return key && resolved?.key === key ? resolved.name : null;
}
