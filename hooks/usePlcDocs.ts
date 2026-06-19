import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc as firestoreDeleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc as firestoreUpdateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcDoc } from '@/types';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';
import { usePlcSubcollection } from '@/context/usePlcContext';

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

export function parseDoc(
  id: string,
  data: Record<string, unknown>
): PlcDoc | null {
  if (
    typeof data.title !== 'string' ||
    typeof data.url !== 'string' ||
    typeof data.createdBy !== 'string' ||
    typeof data.createdByName !== 'string'
  ) {
    return null;
  }
  // createdAt / updatedAt are serverTimestamp()-backed on write (Decision
  // 1.3); legacy docs carry plain millis numbers. `tsToMillis` tolerates both.
  return {
    id,
    title: data.title,
    url: data.url,
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

/**
 * Live subscription to a PLC's shared Google Docs. Returns docs ordered
 * newest-first by `createdAt`. Pass `null` for `plcId` to skip the
 * listener (e.g. while the dashboard is closed).
 */
export const usePlcDocs = (plcId: string | null): UsePlcDocsResult => {
  const { user } = useAuth();
  // Back-compat (Decision 1.4): read from a mounted PlcProvider when present.
  const fromProvider = usePlcSubcollection(plcId, (s) => s.docs);
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
    if (fromProvider) return;
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
  }, [plcId, user, fromProvider]);

  const createDoc = useCallback(
    async (input: { title: string; url: string }): Promise<string> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const ref = doc(
        collection(db, PLCS_COLLECTION, plcId, DOCS_SUBCOLLECTION)
      );
      // serverTimestamp() for the time fields (Decision 1.3); the typed
      // `PlcDoc.createdAt/updatedAt: number` is the read-side shape after
      // `parseDoc` resolves the Timestamp. The write payload can't be the
      // typed `PlcDoc` (the sentinel isn't a number).
      await setDoc(ref, {
        id: ref.id,
        title: input.title,
        url: input.url,
        createdBy: user.uid,
        createdByName: user.displayName ?? '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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
        updatedAt: serverTimestamp(),
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

  return useMemo(() => {
    const resolved = fromProvider
      ? {
          docs: fromProvider.data,
          loading: fromProvider.loading,
          error: fromProvider.error,
        }
      : { docs, loading, error };
    return { ...resolved, createDoc, updateDoc, deleteDoc };
  }, [fromProvider, docs, loading, error, createDoc, updateDoc, deleteDoc]);
};
