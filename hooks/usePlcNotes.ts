import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcNote } from '@/types';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';
import { usePlcSubcollection } from '@/context/usePlcContext';

const PLCS_COLLECTION = 'plcs';
const NOTES_SUBCOLLECTION = 'notes';

interface UsePlcNotesResult {
  notes: PlcNote[];
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty `notes` array
   * is "couldn't load," not "no items yet."
   */
  error: Error | null;
  /** Create a new note. Returns the new doc id. */
  createNote: (input: { title: string; body: string }) => Promise<string>;
  /** Patch an existing note's title/body. Stamps `lastEditedBy/At` to the current user. */
  updateNote: (
    noteId: string,
    patch: { title?: string; body?: string }
  ) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
}

export function parseNote(
  id: string,
  data: Record<string, unknown>
): PlcNote | null {
  if (
    typeof data.title !== 'string' ||
    typeof data.body !== 'string' ||
    typeof data.createdBy !== 'string' ||
    typeof data.lastEditedBy !== 'string'
  ) {
    return null;
  }
  // createdAt / lastEditedAt are serverTimestamp()-backed on write (Decision
  // 1.3) but legacy docs still carry plain millis numbers. `tsToMillis`
  // tolerates both a Firestore Timestamp and a number (and yields 0 for an
  // as-yet-unresolved pending server timestamp from the local snapshot).
  return {
    id,
    title: data.title,
    body: data.body,
    createdBy: data.createdBy,
    createdAt: tsToMillis(data.createdAt),
    lastEditedBy: data.lastEditedBy,
    lastEditedAt: tsToMillis(data.lastEditedAt),
  };
}

/**
 * Live subscription to a PLC's shared notes. Returns notes ordered
 * newest-first by `lastEditedAt`. Pass `null` for `plcId` to skip the
 * listener (e.g. while the dashboard is closed).
 */
export const usePlcNotes = (plcId: string | null): UsePlcNotesResult => {
  const { user } = useAuth();
  // Back-compat (Decision 1.4): read the deduped notes slice from a mounted
  // PlcProvider when present; otherwise keep the standalone subscription below.
  const fromProvider = usePlcSubcollection(plcId, (s) => s.notes);
  const [notes, setNotes] = useState<PlcNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setNotes([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (fromProvider) return;
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setNotes([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(db, PLCS_COLLECTION, plcId, NOTES_SUBCOLLECTION);
    const unsub = onSnapshot(
      query(ref, orderBy('lastEditedAt', 'desc')),
      (snap) => {
        const list: PlcNote[] = [];
        snap.forEach((d) => {
          const parsed = parseNote(d.id, d.data() as Record<string, unknown>);
          if (parsed) list.push(parsed);
        });
        setNotes(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcNotes.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user, fromProvider]);

  const createNote = useCallback(
    async (input: { title: string; body: string }): Promise<string> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const ref = doc(
        collection(db, PLCS_COLLECTION, plcId, NOTES_SUBCOLLECTION)
      );
      // serverTimestamp() for the time fields (Decision 1.3); the typed
      // `PlcNote.createdAt/lastEditedAt: number` is the read-side shape after
      // `parseNote` resolves the Timestamp via `tsToMillis`. The write payload
      // therefore can't be the typed `PlcNote` (the sentinel isn't a number).
      await setDoc(ref, {
        id: ref.id,
        title: input.title,
        body: input.body,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        lastEditedBy: user.uid,
        lastEditedAt: serverTimestamp(),
      });
      return ref.id;
    },
    [plcId, user]
  );

  const updateNote = useCallback(
    async (
      noteId: string,
      patch: { title?: string; body?: string }
    ): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      // Patch-only updates so a teammate's concurrent edit on the *other*
      // field isn't reverted by our stale local snapshot. The rule's
      // `keys.hasOnly(...)` check applies to the post-merge doc, so a
      // partial `updateDoc` passes — `id`/`createdBy`/`createdAt` stay
      // immutable because they're untouched.
      //
      // `lastEditedBy` + `lastEditedAt` must be in the patch on every
      // edit: the rule requires `lastEditedBy == request.auth.uid` and
      // `lastEditedAt is int` on update.
      const fields: Record<string, unknown> = {
        lastEditedBy: user.uid,
        lastEditedAt: serverTimestamp(),
      };
      if (patch.title !== undefined) fields.title = patch.title;
      if (patch.body !== undefined) fields.body = patch.body;
      await updateDoc(
        doc(db, PLCS_COLLECTION, plcId, NOTES_SUBCOLLECTION, noteId),
        fields
      );
    },
    [plcId, user]
  );

  const deleteNote = useCallback(
    async (noteId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await deleteDoc(
        doc(db, PLCS_COLLECTION, plcId, NOTES_SUBCOLLECTION, noteId)
      );
    },
    [plcId, user]
  );

  return useMemo(() => {
    const resolved = fromProvider
      ? {
          notes: fromProvider.data,
          loading: fromProvider.loading,
          error: fromProvider.error,
        }
      : { notes, loading, error };
    return { ...resolved, createNote, updateNote, deleteNote };
  }, [fromProvider, notes, loading, error, createNote, updateNote, deleteNote]);
};
