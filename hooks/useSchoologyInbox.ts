// Live list of quizzes the Chrome extension sent from Schoology (docs/plans/SCHOOLOGY_QUIZ_IMPORT.md Q8).
import { useCallback, useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { getBlob, ref } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import type { ExtractedImage } from '@/utils/quizDocumentImport/types';
import {
  SCHOOLOGY_INBOX_COLLECTION,
  parseInboxItem,
  type SchoologyInboxItem,
} from '@/utils/schoologyInbox';

export interface SchoologyInbox {
  items: SchoologyInboxItem[];
  /** Deletes the entry; the server then removes its pictures. */
  remove: (itemId: string) => Promise<void>;
  /** Downloads the entry's pictures for `attachDocumentImages`. */
  loadImages: (item: SchoologyInboxItem) => Promise<ExtractedImage[]>;
}

export function useSchoologyInbox(
  uid: string | undefined,
  enabled: boolean
): SchoologyInbox {
  const [items, setItems] = useState<SchoologyInboxItem[]>([]);
  const active = enabled && !!uid;

  useEffect(() => {
    if (!active || !uid) return;
    return onSnapshot(
      collection(db, 'users', uid, SCHOOLOGY_INBOX_COLLECTION),
      (snap) =>
        setItems(
          snap.docs
            .map((d) => parseInboxItem(d.id, d.data()))
            .filter((item): item is SchoologyInboxItem => item !== null)
        ),
      (err) => {
        console.error('[useSchoologyInbox] listener failed', err);
        setItems([]);
      }
    );
  }, [active, uid]);

  const remove = useCallback(
    async (itemId: string) => {
      if (!uid) throw new Error('Not authenticated');
      await deleteDoc(
        doc(db, 'users', uid, SCHOOLOGY_INBOX_COLLECTION, itemId)
      );
    },
    [uid]
  );

  const loadImages = useCallback(
    (item: SchoologyInboxItem): Promise<ExtractedImage[]> =>
      Promise.all(
        item.images.map(async (img) => ({
          id: img.id,
          blob: await getBlob(ref(storage, img.path)),
          contentType: img.contentType,
          name: img.name,
        }))
      ),
    []
  );

  return { items: active ? items : [], remove, loadImages };
}
