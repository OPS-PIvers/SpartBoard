// Who hosts a Synced or View-Only board share, read once per share id.

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

const hostByShareId = new Map<string, Promise<string | null>>();

const loadShareHost = (shareId: string): Promise<string | null> => {
  let pending = hostByShareId.get(shareId);
  if (!pending) {
    pending = getDoc(doc(db, 'shared_boards', shareId))
      .then((snap) => {
        const author: unknown = snap.data()?.originalAuthor;
        return typeof author === 'string' && author ? author : null;
      })
      .catch((err: unknown) => {
        hostByShareId.delete(shareId);
        console.error('[useLinkedShareHost] Could not read the share:', err);
        return null;
      });
    hostByShareId.set(shareId, pending);
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
    void loadShareHost(shareId).then((hostUid) => {
      if (!cancelled) setResolved({ shareId, hostUid });
    });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  return shareId && resolved?.shareId === shareId ? resolved.hostUid : null;
}
