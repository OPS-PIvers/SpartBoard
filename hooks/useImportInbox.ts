// Live list of pages the Chrome extension sent to Import (docs/plans/IMPORT.md D14).
import { useCallback, useEffect, useState } from 'react';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  IMPORT_INBOX_COLLECTION,
  type ImportInboxItem,
} from '@/utils/import/contract';
import { parseImportInboxItem } from '@/utils/import/inbox';

export interface ImportInbox {
  /** Newest first. */
  items: ImportInboxItem[];
  /** Deletes the Send once it is saved or discarded. */
  remove: (id: string) => Promise<void>;
}

const isExpired = (expireAt: unknown): boolean =>
  expireAt instanceof Timestamp && expireAt.toMillis() <= Date.now();

export function useImportInbox(
  uid: string | undefined,
  enabled: boolean
): ImportInbox {
  const [items, setItems] = useState<ImportInboxItem[]>([]);
  const active = enabled && !!uid;

  useEffect(() => {
    if (!active || !uid) return;
    return onSnapshot(
      collection(db, 'users', uid, IMPORT_INBOX_COLLECTION),
      (snap) =>
        setItems(
          snap.docs
            .filter((d) => !isExpired(d.get('expireAt')))
            .map((d) => parseImportInboxItem(d.id, d.data()))
            .filter((item): item is ImportInboxItem => item !== null)
            .sort((a, b) => b.receivedAt - a.receivedAt)
        ),
      (err) => {
        console.error('[useImportInbox] listener failed', err);
        setItems([]);
      }
    );
  }, [active, uid]);

  const remove = useCallback(
    async (id: string) => {
      if (!uid) throw new Error('Not authenticated');
      await deleteDoc(doc(db, 'users', uid, IMPORT_INBOX_COLLECTION, id));
    },
    [uid]
  );

  return { items: active ? items : [], remove };
}
