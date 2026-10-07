// Team updates and acknowledgements (docs/plans/TEAMS_REDESIGN.md T27).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { PlcUpdate, PlcUpdateAck } from '@/types';
import { logError } from '@/utils/logError';
import {
  ATTACHMENT_NAME_MAX,
  parsePlcUpdate,
  parsePlcUpdateAck,
  pickWatched,
  sortUpdates,
} from '@/utils/teamUpdates';

const UPDATES_LIMIT = 100;

export interface PlcUpdateDraft {
  title: string;
  body: string;
  linkUrl?: string;
  attachment?: { name: string; url: string };
  requiresAck: boolean;
  inDigest: boolean;
}

const updatesCol = (plcId: string) => collection(db, 'plcs', plcId, 'updates');

function draftFields(draft: PlcUpdateDraft) {
  return {
    title: draft.title.trim(),
    body: draft.body.trim(),
    ...(draft.linkUrl ? { linkUrl: draft.linkUrl } : {}),
    ...(draft.attachment
      ? {
          attachment: {
            name: draft.attachment.name.slice(0, ATTACHMENT_NAME_MAX),
            url: draft.attachment.url,
          },
        }
      : {}),
    requiresAck: draft.requiresAck,
    inDigest: draft.inDigest,
  };
}

export function usePlcUpdates(plcId: string | null, enabled = true) {
  const { user } = useAuth();
  const [updates, setUpdates] = useState<PlcUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setUpdates([]);
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
        updatesCol(plcId),
        orderBy('createdAt', 'desc'),
        limit(UPDATES_LIMIT)
      ),
      (snap) => {
        const list: PlcUpdate[] = [];
        snap.forEach((d) => {
          const parsed = parsePlcUpdate(
            d.id,
            d.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>
          );
          if (parsed) list.push(parsed);
        });
        setUpdates(sortUpdates(list));
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcUpdates.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user, enabled]);

  const postUpdate = useCallback(
    async (draft: PlcUpdateDraft): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await setDoc(doc(updatesCol(plcId)), {
        ...draftFields(draft),
        pinned: false,
        reactions: {},
        authorUid: user.uid,
        authorName: user.displayName ?? user.email ?? '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    [plcId, user]
  );

  const editUpdate = useCallback(
    async (updateId: string, draft: PlcUpdateDraft): Promise<void> => {
      if (!plcId) return;
      await updateDoc(doc(updatesCol(plcId), updateId), {
        ...draftFields(draft),
        linkUrl: draft.linkUrl ?? deleteField(),
        attachment: draft.attachment ?? deleteField(),
        updatedAt: serverTimestamp(),
      });
    },
    [plcId]
  );

  const setPinned = useCallback(
    async (updateId: string, pinned: boolean): Promise<void> => {
      if (!plcId) return;
      await updateDoc(doc(updatesCol(plcId), updateId), {
        pinned,
        updatedAt: serverTimestamp(),
      });
    },
    [plcId]
  );

  const removeUpdate = useCallback(
    async (updateId: string): Promise<void> => {
      if (!plcId) return;
      await deleteDoc(doc(updatesCol(plcId), updateId));
    },
    [plcId]
  );

  const setReacted = useCallback(
    async (updateId: string, reacted: boolean): Promise<void> => {
      if (!plcId || !user) return;
      await updateDoc(doc(updatesCol(plcId), updateId), {
        [`reactions.${user.uid}`]: reacted ? true : deleteField(),
      });
    },
    [plcId, user]
  );

  const acknowledge = useCallback(
    async (updateId: string): Promise<void> => {
      if (!plcId || !user) return;
      await setDoc(doc(updatesCol(plcId), updateId, 'acks', user.uid), {
        uid: user.uid,
        name: user.displayName ?? user.email ?? '',
        ackedAt: serverTimestamp(),
      });
    },
    [plcId, user]
  );

  return {
    updates,
    loading,
    error,
    postUpdate,
    editUpdate,
    setPinned,
    removeUpdate,
    setReacted,
    acknowledge,
  };
}

export type PlcUpdatesApi = ReturnType<typeof usePlcUpdates>;

/** The signed-in member's own acks for the given updates: updateId → ackedAt. */
export function useMyUpdateAcks(
  plcId: string | null,
  updateIds: string[]
): Record<string, number> {
  const { user } = useAuth();
  const [acks, setAcks] = useState<Record<string, number>>({});
  const key = updateIds.join(',');
  const ids = useMemo(() => (key ? key.split(',') : []), [key]);

  useEffect(() => {
    if (!plcId || !user || isAuthBypass || ids.length === 0) return;
    const unsubs = ids.map((updateId) =>
      onSnapshot(
        doc(db, 'plcs', plcId, 'updates', updateId, 'acks', user.uid),
        (snap) => {
          setAcks((prev) => {
            const next = { ...prev };
            if (snap.exists()) {
              next[updateId] = parsePlcUpdateAck(
                snap.id,
                snap.data({ serverTimestamps: 'estimate' })
              ).ackedAt;
            } else {
              delete next[updateId];
            }
            return next;
          });
        },
        (err) => logError('useMyUpdateAcks.snapshot', err, { plcId })
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [plcId, user, ids]);

  return useMemo(() => pickWatched(acks, ids), [acks, ids]);
}

/** Every ack on each listed update: updateId → acks. Rules allow this for the lead and co-leads only. */
export function useUpdateAcksFor(
  plcId: string | null,
  updateIds: string[],
  enabled: boolean
): Record<string, PlcUpdateAck[]> {
  const { user } = useAuth();
  const [acks, setAcks] = useState<Record<string, PlcUpdateAck[]>>({});
  const key = updateIds.join(',');
  const ids = useMemo(() => (key ? key.split(',') : []), [key]);

  useEffect(() => {
    if (!plcId || !user || !enabled || isAuthBypass || ids.length === 0) {
      return;
    }
    const unsubs = ids.map((updateId) =>
      onSnapshot(
        collection(db, 'plcs', plcId, 'updates', updateId, 'acks'),
        (snap) => {
          const list = snap.docs.map((d) =>
            parsePlcUpdateAck(d.id, d.data({ serverTimestamps: 'estimate' }))
          );
          setAcks((prev) => ({ ...prev, [updateId]: list }));
        },
        (err) => logError('useUpdateAcksFor.snapshot', err, { plcId, updateId })
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [plcId, user, enabled, ids]);

  return useMemo(
    () => (enabled ? pickWatched(acks, ids) : {}),
    [acks, ids, enabled]
  );
}

/** Lead or co-lead: attach (or with null, remove) the team's Google Calendar embed (T28). */
export async function saveTeamCalendar(
  plcId: string,
  url: string | null
): Promise<void> {
  await updateDoc(doc(db, 'plcs', plcId), {
    calendarEmbedUrl: url ?? deleteField(),
    updatedAt: serverTimestamp(),
  });
}
