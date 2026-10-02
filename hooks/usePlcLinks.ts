import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { PlcLink } from '@/types';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';
import { ensureProtocol } from '@/utils/urlHelpers';

export function parsePlcLink(
  id: string,
  data: Record<string, unknown>
): PlcLink | null {
  if (
    typeof data.title !== 'string' ||
    typeof data.url !== 'string' ||
    typeof data.createdBy !== 'string'
  ) {
    return null;
  }
  return {
    id,
    title: data.title,
    url: data.url,
    ...(typeof data.note === 'string' && data.note.length > 0
      ? { note: data.note }
      : {}),
    createdBy: data.createdBy,
    createdByName:
      typeof data.createdByName === 'string' ? data.createdByName : '',
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

export interface PlcLinkDraft {
  title: string;
  url: string;
  note: string;
}

export const usePlcLinks = (plcId: string | null, enabled = true) => {
  const { user } = useAuth();
  const [links, setLinks] = useState<PlcLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setLinks([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!plcId || !user || !enabled || isAuthBypass) {
      const t = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(t);
    }
    const unsub = onSnapshot(
      query(
        collection(db, 'plcs', plcId, 'links'),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        const list: PlcLink[] = [];
        snap.forEach((d) => {
          const parsed = parsePlcLink(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed) list.push(parsed);
        });
        setLinks(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcLinks.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user, enabled]);

  const addLink = useCallback(
    async (draft: PlcLinkDraft): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const ref = doc(collection(db, 'plcs', plcId, 'links'));
      const note = draft.note.trim();
      await setDoc(ref, {
        id: ref.id,
        title: draft.title.trim(),
        url: ensureProtocol(draft.url).replace(/^https?:\/\//i, 'https://'),
        ...(note.length > 0 ? { note } : {}),
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email ?? '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    [plcId, user]
  );

  const removeLink = useCallback(
    async (linkId: string): Promise<void> => {
      if (!plcId) return;
      await deleteDoc(doc(db, 'plcs', plcId, 'links', linkId));
    },
    [plcId]
  );

  return { links, loading, error, addLink, removeLink };
};
