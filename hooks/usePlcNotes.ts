import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
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
import { writePlcActivityEvent } from '@/utils/plcActivity';

const PLCS_COLLECTION = 'plcs';
const NOTES_SUBCOLLECTION = 'notes';

/**
 * Resolve a stable display name for an activity actor: prefer the display name,
 * then the email, then the uid. Empty strings are treated as absent (the `||`
 * chain on `?? ''`-defaulted operands) so a blank display name still falls
 * through to the email. Mirrors the helper in `usePlcTrash` / `usePlcs` so every
 * activity writer snapshots names the same way.
 */
function resolveActorName(user: {
  displayName?: string | null;
  email?: string | null;
  uid: string;
}): string {
  const displayName = user.displayName?.trim() ?? '';
  const email = user.email?.trim() ?? '';
  return displayName || email || user.uid;
}

/**
 * Thrown by `updateNote` when the optimistic version precondition loses the
 * race — i.e. a teammate committed an edit (bumping the canonical `version`)
 * between this client reading the note and writing its own bump (Decision 2.4).
 * Mirrors `SyncedQuizVersionConflictError`: the caller catches it, surfaces the
 * conflict toast, and reloads the canonical note into the draft rather than
 * silently overwriting the teammate's change. `currentVersion` is `null` when
 * the canonical doc lost its `version` field underneath us (shouldn't happen
 * once migrated, but the parser stays tolerant during rollout).
 */
export class PlcNoteVersionConflictError extends Error {
  readonly noteId: string;
  readonly expectedVersion: number | null;
  readonly currentVersion: number | null;
  constructor(
    noteId: string,
    expectedVersion: number | null,
    currentVersion: number | null
  ) {
    super(
      `PLC note ${noteId} canonical version is ${String(currentVersion)} but caller expected ${String(expectedVersion)}.`
    );
    this.name = 'PlcNoteVersionConflictError';
    this.noteId = noteId;
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}

/** Patch shape for `updateNote` — title/body content plus the optional
 * structured-meeting fields and the soft-delete tombstone. */
export interface UpdateNotePatch {
  title?: string;
  body?: string;
  kind?: 'freeform' | 'meeting';
  meetingId?: string | null;
  deletedAt?: number | null;
}

/**
 * Options for `updateNote`. `expectedVersion` is the optimistic-concurrency base
 * (Decision 2.4): the `version` the caller's draft was LOADED from. The write
 * sends `version: expectedVersion + 1` so a concurrent teammate edit (which
 * already bumped the canonical version past `expectedVersion`) makes the rule's
 * `new == old + 1` precondition fail — surfacing the conflict instead of
 * silently overwriting. Omit it for a legacy note that has never carried a
 * `version` (the rollout escape hatch: both sides omit `version`,
 * last-write-wins); pass it for every versioned note.
 */
export interface UpdateNoteOptions {
  /** The `version` the caller loaded; the write bumps to `expectedVersion + 1`. */
  expectedVersion?: number;
}

interface UsePlcNotesResult {
  notes: PlcNote[];
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty `notes` array
   * is "couldn't load," not "no items yet."
   */
  error: Error | null;
  /**
   * Create a new note. Returns the new doc id. `kind` defaults to `'freeform'`;
   * pass `'meeting'` (with the agenda→decisions→action-items template body) for
   * the native structured meeting note (Decision 2.5b). A freshly created note
   * seeds `version: 0` so the first edit bumps it to `1` under the rule's
   * precondition.
   */
  createNote: (input: {
    title: string;
    body: string;
    kind?: 'freeform' | 'meeting';
    meetingId?: string | null;
  }) => Promise<string>;
  /**
   * Patch an existing note's content. Stamps `lastEditedBy/At` to the current
   * user and enforces the optimistic version precondition (Decision 2.4):
   * sends `version: expectedVersion + 1` computed from the version the caller
   * LOADED (passed via `options.expectedVersion`) — NOT a fresh in-write read.
   * A single non-transactional `updateDoc` is used deliberately: a Firestore
   * `runTransaction` auto-retries on contention and would re-read the canonical
   * version, recompute `latest + 1`, and silently overwrite a teammate's edit.
   * Sending a fixed `expectedVersion + 1` instead makes the rule's
   * `new == old + 1` check fail when a teammate already bumped past the base,
   * surfacing `PlcNoteVersionConflictError` so the caller reloads rather than
   * clobbering. Legacy notes that have never carried a `version` omit
   * `expectedVersion` and keep saving (the rule's both-absent rollout escape
   * hatch, last-write-wins).
   */
  updateNote: (
    noteId: string,
    patch: UpdateNotePatch,
    options?: UpdateNoteOptions
  ) => Promise<void>;
  /**
   * Soft-delete a note (Decision 3.1): sets the `deletedAt` tombstone via
   * `updateNote` (so the version precondition is honored and the note drops out
   * of the live list, which filters `deletedAt != null`) rather than
   * hard-deleting. Restore with `restoreNote`. Pass the note's loaded `version`
   * so the tombstone write respects the precondition; may throw
   * `PlcNoteVersionConflictError` if a teammate's edit won the version race.
   */
  deleteNote: (noteId: string, expectedVersion?: number) => Promise<void>;
  /** Restore a soft-deleted note by clearing its `deletedAt` tombstone. */
  restoreNote: (noteId: string, expectedVersion?: number) => Promise<void>;
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
  const note: PlcNote = {
    id,
    title: data.title,
    body: data.body,
    createdBy: data.createdBy,
    createdAt: tsToMillis(data.createdAt),
    lastEditedBy: data.lastEditedBy,
    lastEditedAt: tsToMillis(data.lastEditedAt),
  };
  // Wave-2 fields (§3.8) — all optional so legacy notes lacking them parse
  // cleanly. `kind` falls back to 'freeform' only when an out-of-union value
  // sneaks in; absent stays absent (treated as freeform by consumers).
  if (data.kind === 'meeting' || data.kind === 'freeform') {
    note.kind = data.kind;
  }
  if (typeof data.meetingId === 'string') {
    note.meetingId = data.meetingId;
  } else if (data.meetingId === null) {
    note.meetingId = null;
  }
  // `version` is the optimistic-concurrency counter. Legacy notes omit it; we
  // leave it `undefined` rather than defaulting to 0 so the update path can
  // distinguish "never versioned" (rollout escape hatch) from "version 0".
  if (typeof data.version === 'number') {
    note.version = data.version;
  }
  if (typeof data.deletedAt === 'number') {
    note.deletedAt = data.deletedAt;
  } else if (data.deletedAt === null) {
    note.deletedAt = null;
  }
  return note;
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
          // Soft-deleted notes (Decision 3.1) drop out of the live list — they
          // live in Trash until restored or GC'd.
          if (parsed && parsed.deletedAt == null) list.push(parsed);
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
    async (input: {
      title: string;
      body: string;
      kind?: 'freeform' | 'meeting';
      meetingId?: string | null;
    }): Promise<string> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const ref = doc(
        collection(db, PLCS_COLLECTION, plcId, NOTES_SUBCOLLECTION)
      );
      // serverTimestamp() for the time fields (Decision 1.3); the typed
      // `PlcNote.createdAt/lastEditedAt: number` is the read-side shape after
      // `parseNote` resolves the Timestamp via `tsToMillis`. The write payload
      // therefore can't be the typed `PlcNote` (the sentinel isn't a number).
      //
      // `version: 0` seeds the optimistic-concurrency counter (Decision 2.4):
      // the first edit transitions it to 1 under the rule's `new == old + 1`
      // precondition. `kind`/`meetingId` are only written when provided so a
      // freeform note stays minimal and legacy readers ignore the absent keys.
      const payload: Record<string, unknown> = {
        id: ref.id,
        title: input.title,
        body: input.body,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        lastEditedBy: user.uid,
        lastEditedAt: serverTimestamp(),
        version: 0,
      };
      if (input.kind) payload.kind = input.kind;
      if (input.meetingId !== undefined) payload.meetingId = input.meetingId;
      await setDoc(ref, payload);

      // Activity log (Decision 2.2, §3.4) — native notes is Wave 2's headline
      // feature, so a created note must surface in the "since you were here"
      // digest + unread badge. Fire-and-forget like the comment fan-out: it
      // never blocks or fails the note write. `targetTitle` snapshots the title
      // so the feed renders without a join (empty titles fall back to the
      // feed's translated "an item" placeholder).
      const actorName = resolveActorName(user);
      void writePlcActivityEvent(plcId, {
        type: 'note_created',
        actorUid: user.uid,
        actorName,
        targetType: 'note',
        targetId: ref.id,
        ...(input.title.trim() ? { targetTitle: input.title.trim() } : {}),
      });
      return ref.id;
    },
    [plcId, user]
  );

  const updateNote = useCallback(
    async (
      noteId: string,
      patch: UpdateNotePatch,
      options?: UpdateNoteOptions
    ): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const ref = doc(db, PLCS_COLLECTION, plcId, NOTES_SUBCOLLECTION, noteId);
      const uid = user.uid;
      const expectedVersion = options?.expectedVersion;

      // Optimistic version precondition (Decision 2.4) via a SINGLE
      // non-transactional `updateDoc`. We deliberately do NOT use
      // `runTransaction`: a transaction auto-retries on write contention and,
      // on retry, would re-read the NEW canonical version and recompute
      // `latest + 1` — which always satisfies the rule and SILENTLY OVERWRITES
      // a teammate's concurrent same-field edit (the very loss this guard must
      // prevent). Instead we send `version: expectedVersion + 1` computed from
      // the version the caller LOADED. When a teammate already bumped the
      // canonical version past `expectedVersion`, the rule's
      // `new == old + 1` check fails and Firestore rejects the write — which we
      // normalize to `PlcNoteVersionConflictError` so the caller reloads.
      //
      // Patch-only fields so a teammate's concurrent edit on the *other* field
      // isn't reverted by our stale local snapshot. The rule's
      // `keys.hasOnly(...)` check applies to the post-merge doc, so a partial
      // write passes — `id`/`createdBy`/`createdAt` stay immutable (untouched).
      const fields: Record<string, unknown> = {
        lastEditedBy: uid,
        lastEditedAt: serverTimestamp(),
      };
      if (patch.title !== undefined) fields.title = patch.title;
      if (patch.body !== undefined) fields.body = patch.body;
      if (patch.kind !== undefined) fields.kind = patch.kind;
      if (patch.meetingId !== undefined) fields.meetingId = patch.meetingId;
      if (patch.deletedAt !== undefined) fields.deletedAt = patch.deletedAt;
      // Rollout escape hatch: a legacy note never carried `version`, so the
      // caller omits `expectedVersion` and we must NOT introduce the field (the
      // rule rejects introducing `version` onto a previously-unversioned doc).
      // Last-write-wins, matching pre-Wave-2 behavior for un-migrated notes.
      if (expectedVersion !== undefined) {
        fields.version = expectedVersion + 1;
      }

      await updateDoc(ref, fields).catch((err: unknown) => {
        // The rule rejecting the version precondition (a teammate bumped past
        // `expectedVersion`) surfaces as permission-denied / failed-
        // precondition. Normalize the loss-of-race into the typed conflict so
        // the caller's catch can branch on it.
        throw normalizeNoteWriteError(noteId, expectedVersion ?? null, err);
      });
    },
    [plcId, user]
  );

  // Soft-delete / restore (Decision 3.1) route through `updateNote` so the
  // optimistic version precondition is honored (the deletedAt flip bumps
  // version+1 on a migrated note) and the same conflict handling applies. The
  // note then drops out of (deletedAt set) or returns to (deletedAt null) the
  // live list, which filters `deletedAt != null`. The caller passes the note's
  // loaded `version` so the tombstone write respects the precondition.
  const deleteNote = useCallback(
    async (noteId: string, expectedVersion?: number): Promise<void> => {
      await updateNote(noteId, { deletedAt: Date.now() }, { expectedVersion });
    },
    [updateNote]
  );

  const restoreNote = useCallback(
    async (noteId: string, expectedVersion?: number): Promise<void> => {
      await updateNote(noteId, { deletedAt: null }, { expectedVersion });
    },
    [updateNote]
  );

  return useMemo(() => {
    const resolved = fromProvider
      ? {
          notes: fromProvider.data,
          loading: fromProvider.loading,
          error: fromProvider.error,
        }
      : { notes, loading, error };
    return { ...resolved, createNote, updateNote, deleteNote, restoreNote };
  }, [
    fromProvider,
    notes,
    loading,
    error,
    createNote,
    updateNote,
    deleteNote,
    restoreNote,
  ]);
};

/**
 * Map a write failure to a `PlcNoteVersionConflictError` when it reads as a
 * version-precondition rejection (Firestore surfaces the rule
 * `version == old + 1` failure as `permission-denied` / `failed-precondition`).
 * Any other error is returned as-is so genuine failures aren't masked as
 * conflicts. `expectedVersion` is the base the caller loaded (reported on the
 * conflict so a future surface could show it); we can't read the *current*
 * canonical version from the error itself, so it stays `null` — the caller
 * reloads the live note regardless.
 */
function normalizeNoteWriteError(
  noteId: string,
  expectedVersion: number | null,
  err: unknown
): Error {
  if (err instanceof PlcNoteVersionConflictError) return err;
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  if (code === 'permission-denied' || code === 'failed-precondition') {
    return new PlcNoteVersionConflictError(noteId, expectedVersion, null);
  }
  return err instanceof Error ? err : new Error(String(err));
}
