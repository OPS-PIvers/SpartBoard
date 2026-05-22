import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc as firestoreDeleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc as firestoreUpdateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcDoc } from '@/types';
import { logError } from '@/utils/logError';

const PLCS_COLLECTION = 'plcs';
const DOCS_SUBCOLLECTION = 'docs';

interface UsePlcDocsResult {
  docs: PlcDoc[];
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty `docs` array
   * is "couldn't load," not "no items yet."
   */
  error: Error | null;
  /** Create a new doc. Returns the new doc id. */
  createDoc: (input: { title: string; url: string }) => Promise<string>;
  /** Patch title/url; bumps updatedAt. */
  updateDoc: (
    docId: string,
    patch: { title?: string; url?: string }
  ) => Promise<void>;
  deleteDoc: (docId: string) => Promise<void>;
}

function parseDoc(id: string, data: Record<string, unknown>): PlcDoc | null {
  if (
    typeof data.title !== 'string' ||
    typeof data.url !== 'string' ||
    typeof data.createdBy !== 'string' ||
    typeof data.createdByName !== 'string' ||
    typeof data.createdAt !== 'number' ||
    typeof data.updatedAt !== 'number'
  ) {
    return null;
  }
  return {
    id,
    title: data.title,
    url: data.url,
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/**
 * Live subscription to a PLC's shared Google Docs. Returns docs ordered
 * newest-first by `createdAt`. Pass `null` for `plcId` to skip the
 * listener (e.g. while the dashboard is closed).
 */
export const usePlcDocs = (plcId: string | null): UsePlcDocsResult => {
  const { user } = useAuth();
  const [docs, setDocs] = useState<PlcDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setDocs([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setDocs([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(db, PLCS_COLLECTION, plcId, DOCS_SUBCOLLECTION);
    const unsub = onSnapshot(
      query(ref, orderBy('createdAt', 'desc')),
      (snap) => {
        const list: PlcDoc[] = [];
        snap.forEach((d) => {
          const parsed = parseDoc(d.id, d.data() as Record<string, unknown>);
          if (parsed) list.push(parsed);
        });
        setDocs(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcDocs.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user]);

  const createDoc = useCallback(
    async (input: { title: string; url: string }): Promise<string> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const ref = doc(
        collection(db, PLCS_COLLECTION, plcId, DOCS_SUBCOLLECTION)
      );
      const now = Date.now();
      const plcDoc: PlcDoc = {
        id: ref.id,
        title: input.title,
        url: input.url,
        createdBy: user.uid,
        createdByName: user.displayName ?? '',
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(ref, plcDoc);
      return ref.id;
    },
    [plcId, user]
  );

  const updateDoc = useCallback(
    async (
      docId: string,
      patch: { title?: string; url?: string }
    ): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      // Patch-only updates so a teammate's concurrent edit on the *other*
      // field isn't reverted by our stale local snapshot. The rule's
      // `keys.hasOnly(...)` check applies to the post-merge doc, so a
      // partial `updateDoc` passes — `id`/`createdBy`/`createdByName`/`createdAt`
      // stay immutable because they're untouched.
      const fields: Record<string, unknown> = {
        updatedAt: Date.now(),
      };
      if (patch.title !== undefined) fields.title = patch.title;
      if (patch.url !== undefined) fields.url = patch.url;
      await firestoreUpdateDoc(
        doc(db, PLCS_COLLECTION, plcId, DOCS_SUBCOLLECTION, docId),
        fields
      );
    },
    [plcId, user]
  );

  const deleteDoc = useCallback(
    async (docId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await firestoreDeleteDoc(
        doc(db, PLCS_COLLECTION, plcId, DOCS_SUBCOLLECTION, docId)
      );
    },
    [plcId, user]
  );

  return useMemo(
    () => ({ docs, loading, error, createDoc, updateDoc, deleteDoc }),
    [docs, loading, error, createDoc, updateDoc, deleteDoc]
  );
};
