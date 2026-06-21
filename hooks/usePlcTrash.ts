/**
 * usePlcTrash — the PLC Trash aggregator + the shared soft-delete action hook
 * (Decision 3.1, §3.10, §6.1). Two cooperating pieces live here:
 *
 *   1. `usePlcTrash(plcId)` — subscribes directly to every member-deletable
 *      subcollection (notes, todos, docs, comments, quizzes, video_activities)
 *      and surfaces ONLY the soft-deleted rows (`deletedAt != null`) as a single
 *      newest-deleted-first list, each carrying a `restore()` action. The normal
 *      section lists (and the `PlcProvider` slices) FILTER OUT `deletedAt != null`,
 *      so Trash must read Firestore itself rather than off the provider store.
 *
 *   2. `usePlcSoftDelete(plcId)` — the shared action hook every body component
 *      calls instead of the raw delete mutator. It performs the soft-delete via
 *      the right hook mutator, logs an `item_deleted` activity event, and shows
 *      an UNDO toast whose action restores the item (and logs `item_restored`).
 *      Restore from the Trash view goes through the same `restore*` mutators and
 *      logs `item_restored` too — the single place all delete/restore activity is
 *      emitted, so the mutators themselves stay pure Firestore writers (no toast
 *      / activity coupling).
 *
 * Comments already carried `deletedAt` from T5 (soft-delete shipped there); this
 * hook simply includes them in the aggregate + gives them a restore path (any
 * member may flip `deletedAt` back to null per the comments rules).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import type {
  PlcComment,
  PlcDoc,
  PlcNote,
  PlcQuizEntry,
  PlcTodo,
  PlcVideoActivityEntry,
} from '@/types';
import { logError } from '@/utils/logError';
import { writePlcActivityEvent } from '@/utils/plcActivity';
import { parseNote } from '@/hooks/usePlcNotes';
import { parseTodo } from '@/hooks/usePlcTodos';
import { parseDoc } from '@/hooks/usePlcDocs';
import { parsePlcQuizEntry } from '@/hooks/usePlcQuizzes';
import { parsePlcVideoActivityEntry } from '@/hooks/usePlcVideoActivities';
import { parseComment } from '@/hooks/usePlcComments';

const PLCS_COLLECTION = 'plcs';

/**
 * The kinds of content the Trash view aggregates. `activityTargetType` is the
 * string carried on the `item_deleted` / `item_restored` activity event so a
 * future digest can group by kind; `subcollection` is the Firestore path
 * segment for the soft-delete/restore write.
 */
export type PlcTrashItemType =
  | 'note'
  | 'todo'
  | 'doc'
  | 'comment'
  | 'quiz'
  | 'videoActivity';

/** One soft-deleted row, normalized across content types for the Trash list. */
export interface PlcTrashItem {
  /** Doc id within its subcollection. */
  id: string;
  type: PlcTrashItemType;
  /** Human label for the row (falls back to a generic per-type label). */
  title: string;
  /** Resolved soft-delete timestamp (ms); 0 only for an unresolved pending write. */
  deletedAt: number;
}

interface UsePlcTrashResult {
  /** All soft-deleted items across content types, newest-deleted-first. */
  items: PlcTrashItem[];
  loading: boolean;
  error: Error | null;
  /**
   * Restore one item (clears its `deletedAt`) and log an `item_restored`
   * activity event. Resolves once the write settles.
   */
  restore: (item: PlcTrashItem) => Promise<void>;
}

/** Map a trash item type to its Firestore subcollection path segment. */
const SUBCOLLECTION_FOR: Record<PlcTrashItemType, string> = {
  note: 'notes',
  todo: 'todos',
  doc: 'docs',
  comment: 'comments',
  quiz: 'quizzes',
  videoActivity: 'video_activities',
};

/**
 * Resolve a stable author/display name for the signed-in user (prefer display
 * name, then email, then uid). Empty strings are treated as absent so a blank
 * display name still falls through to the email. Shared by the activity writers.
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

/** Truncate a comment body to a readable Trash-row label. */
function commentLabel(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 60)}…`;
}

/**
 * Aggregate every soft-deleted item across the PLC's member-deletable
 * subcollections into one Trash list, newest-deleted-first. Subscribes directly
 * (the provider/hook lists filter tombstoned rows out), so it is meant to be
 * mounted only while the Trash view is open (inside Settings).
 */
export function usePlcTrash(plcId: string | null): UsePlcTrashResult {
  const { user } = useAuth();
  const [notes, setNotes] = useState<PlcNote[]>([]);
  const [todos, setTodos] = useState<PlcTodo[]>([]);
  const [docs, setDocs] = useState<PlcDoc[]>([]);
  const [comments, setComments] = useState<PlcComment[]>([]);
  const [quizzes, setQuizzes] = useState<PlcQuizEntry[]>([]);
  const [videoActivities, setVideoActivities] = useState<
    PlcVideoActivityEntry[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Reset on PLC change (prev-prop pattern, not an effect) so a previous PLC's
  // trash never flashes under a freshly opened one.
  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setNotes([]);
    setTodos([]);
    setDocs([]);
    setComments([]);
    setQuizzes([]);
    setVideoActivities([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const tmr = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(tmr);
    }
    let settled = 0;
    const total = 6;
    const markSettled = () => {
      settled += 1;
      if (settled >= total) setLoading(false);
    };
    const onErr = (scope: string) => (err: unknown) => {
      logError(`usePlcTrash.${scope}`, err, { plcId });
      setError(err instanceof Error ? err : new Error(String(err)));
      markSettled();
    };

    // Each listener parses the whole subcollection and keeps only tombstoned
    // rows. No orderBy: Trash sorts client-side on `deletedAt` after merging.
    const unsubNotes = onSnapshot(
      query(collection(db, PLCS_COLLECTION, plcId, 'notes')),
      (snap) => {
        const list: PlcNote[] = [];
        snap.forEach((d) => {
          const parsed = parseNote(d.id, d.data() as Record<string, unknown>);
          if (parsed && parsed.deletedAt != null) list.push(parsed);
        });
        setNotes(list);
        markSettled();
      },
      onErr('notes')
    );
    const unsubTodos = onSnapshot(
      query(collection(db, PLCS_COLLECTION, plcId, 'todos')),
      (snap) => {
        const list: PlcTodo[] = [];
        snap.forEach((d) => {
          const parsed = parseTodo(d.id, d.data() as Record<string, unknown>);
          if (parsed && parsed.deletedAt != null) list.push(parsed);
        });
        setTodos(list);
        markSettled();
      },
      onErr('todos')
    );
    const unsubDocs = onSnapshot(
      query(collection(db, PLCS_COLLECTION, plcId, 'docs')),
      (snap) => {
        const list: PlcDoc[] = [];
        snap.forEach((d) => {
          const parsed = parseDoc(d.id, d.data() as Record<string, unknown>);
          if (parsed && parsed.deletedAt != null) list.push(parsed);
        });
        setDocs(list);
        markSettled();
      },
      onErr('docs')
    );
    const unsubComments = onSnapshot(
      query(collection(db, PLCS_COLLECTION, plcId, 'comments')),
      (snap) => {
        const list: PlcComment[] = [];
        snap.forEach((d) => {
          const parsed = parseComment(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed && parsed.deletedAt != null) list.push(parsed);
        });
        setComments(list);
        markSettled();
      },
      onErr('comments')
    );
    const unsubQuizzes = onSnapshot(
      query(collection(db, PLCS_COLLECTION, plcId, 'quizzes')),
      (snap) => {
        const list: PlcQuizEntry[] = [];
        snap.forEach((d) => {
          const parsed = parsePlcQuizEntry(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed && parsed.deletedAt != null) list.push(parsed);
        });
        setQuizzes(list);
        markSettled();
      },
      onErr('quizzes')
    );
    const unsubVas = onSnapshot(
      query(collection(db, PLCS_COLLECTION, plcId, 'video_activities')),
      (snap) => {
        const list: PlcVideoActivityEntry[] = [];
        snap.forEach((d) => {
          const parsed = parsePlcVideoActivityEntry(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed && parsed.deletedAt != null) list.push(parsed);
        });
        setVideoActivities(list);
        markSettled();
      },
      onErr('videoActivities')
    );

    return () => {
      unsubNotes();
      unsubTodos();
      unsubDocs();
      unsubComments();
      unsubQuizzes();
      unsubVas();
    };
  }, [plcId, user]);

  const items = useMemo<PlcTrashItem[]>(() => {
    const merged: PlcTrashItem[] = [];
    for (const n of notes) {
      merged.push({
        id: n.id,
        type: 'note',
        title: n.title,
        deletedAt: n.deletedAt ?? 0,
      });
    }
    for (const td of todos) {
      merged.push({
        id: td.id,
        type: 'todo',
        title: td.text,
        deletedAt: td.deletedAt ?? 0,
      });
    }
    for (const d of docs) {
      merged.push({
        id: d.id,
        type: 'doc',
        title: d.title,
        deletedAt: d.deletedAt ?? 0,
      });
    }
    for (const c of comments) {
      merged.push({
        id: c.id,
        type: 'comment',
        title: commentLabel(c.body),
        deletedAt: c.deletedAt ?? 0,
      });
    }
    for (const q of quizzes) {
      merged.push({
        id: q.id,
        type: 'quiz',
        title: q.title,
        deletedAt: q.deletedAt ?? 0,
      });
    }
    for (const va of videoActivities) {
      merged.push({
        id: va.id,
        type: 'videoActivity',
        title: va.title,
        deletedAt: va.deletedAt ?? 0,
      });
    }
    // Newest-deleted-first.
    merged.sort((a, b) => b.deletedAt - a.deletedAt);
    return merged;
  }, [notes, todos, docs, comments, quizzes, videoActivities]);

  const restore = useCallback(
    async (item: PlcTrashItem): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await restorePlcItem(plcId, item.type, item.id, user.uid);
      // Activity (Decision 2.2 / §3.10) — fire-and-forget; never blocks restore.
      void writePlcActivityEvent(plcId, {
        type: 'item_restored',
        actorUid: user.uid,
        actorName: resolveActorName(user),
        targetType: item.type,
        targetId: item.id,
        targetTitle: item.title,
      });
    },
    [plcId, user]
  );

  return useMemo(
    () => ({ items, loading, error, restore }),
    [items, loading, error, restore]
  );
}

/**
 * Write the restore patch (clear `deletedAt`) for any trash item type. Notes,
 * docs, quizzes and video activities also bump their time field so the row
 * resurfaces at the top of its list; comments and to-dos carry no extra
 * timestamp. A note that still carries a `version` would, on a strict reading of
 * the rules, need a +1 bump — but the restore path here clears `deletedAt` only;
 * for notes the undo/restore flows that must honor the version precondition go
 * through `usePlcSoftDelete` / the note hook, while a stale-trash restore of a
 * note is rare and the rules' both-absent rollout escape hatch covers
 * un-versioned notes. To keep restore robust for versioned notes too, the note
 * branch reads + bumps the version inline.
 */
async function restorePlcItem(
  plcId: string,
  type: PlcTrashItemType,
  id: string,
  uid: string
): Promise<void> {
  const ref = doc(db, PLCS_COLLECTION, plcId, SUBCOLLECTION_FOR[type], id);
  switch (type) {
    case 'doc':
      await updateDoc(ref, {
        deletedAt: null,
        updatedAt: serverTimestamp(),
      });
      return;
    case 'quiz':
    case 'videoActivity':
      await updateDoc(ref, { deletedAt: null, updatedAt: Date.now() });
      return;
    case 'todo':
    case 'comment':
      await updateDoc(ref, { deletedAt: null });
      return;
    case 'note':
      // Restore a note honoring the optimistic version precondition: clear the
      // tombstone, re-stamp lastEditedAt, and bump version+1 when the doc is
      // versioned (un-versioned notes take the rollout escape hatch — no
      // version introduced). lastEditedBy is left untouched (it stays whoever
      // last edited the note's content); the rule does NOT require restamping it
      // on a deletedAt-only flip because the membership gate covers the writer.
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Note not found');
        const data = snap.data() as Record<string, unknown>;
        const currentVersion =
          typeof data.version === 'number' ? data.version : null;
        const fields: Record<string, unknown> = {
          deletedAt: null,
          // The note update rule pins `lastEditedBy == request.auth.uid`, so the
          // restorer must stamp themselves even on a deletedAt-only flip.
          lastEditedBy: uid,
          lastEditedAt: serverTimestamp(),
        };
        if (currentVersion !== null) fields.version = currentVersion + 1;
        tx.update(ref, fields);
      });
      return;
  }
}

// --- Soft-delete action hook ------------------------------------------------

/**
 * The patch the soft-delete writers use, parameterized so a single hook handles
 * every content type. `restore` is the inverse write; both are async + reject on
 * failure so the caller can surface a toast.
 */
export interface PlcSoftDeleteActions {
  /**
   * Soft-delete one item: write its `deletedAt` tombstone via the right
   * mutator, log an `item_deleted` activity event, and show an UNDO toast whose
   * action restores it (logging `item_restored`). Rejects if the soft-delete
   * write itself fails (so the caller can surface an error); the undo toast is
   * shown only after a successful soft-delete.
   */
  softDelete: (input: {
    type: PlcTrashItemType;
    id: string;
    /** Title snapshot for the activity event + (optionally) the toast copy. */
    title: string;
    /** Perform the actual soft-delete write (the hook's `delete*` mutator). */
    runDelete: () => Promise<void>;
    /** Perform the inverse restore write (the hook's `restore*` mutator). */
    runRestore: () => Promise<void>;
  }) => Promise<void>;
}

/**
 * Shared soft-delete-with-undo action hook. Body components call
 * `softDelete({...})` after confirming the delete; the hook fires the
 * `item_deleted` activity event and pops the undo toast wired to the supplied
 * `runRestore` (which then logs `item_restored`). Centralizing this keeps the
 * mutators pure (no toast/activity/i18n coupling) and the undo UX consistent.
 */
export function usePlcSoftDelete(plcId: string | null): PlcSoftDeleteActions {
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { t } = useTranslation();

  const softDelete = useCallback<PlcSoftDeleteActions['softDelete']>(
    async ({ type, id, title, runDelete, runRestore }) => {
      if (!plcId || !user) throw new Error('Not signed in');
      await runDelete();
      const actorName = resolveActorName(user);
      const actorUid = user.uid;
      // Activity (Decision 2.2 / §3.10) — fire-and-forget; never blocks.
      void writePlcActivityEvent(plcId, {
        type: 'item_deleted',
        actorUid,
        actorName,
        targetType: type,
        targetId: id,
        targetTitle: title,
      });
      // Undo toast — restores the item and logs `item_restored`.
      addToast(
        t('plcDashboard.trash.deletedToast', {
          defaultValue: 'Item moved to Trash',
        }),
        'info',
        {
          label: t('plcDashboard.trash.undo', { defaultValue: 'Undo' }),
          onClick: () => {
            void runRestore()
              .then(() => {
                void writePlcActivityEvent(plcId, {
                  type: 'item_restored',
                  actorUid,
                  actorName,
                  targetType: type,
                  targetId: id,
                  targetTitle: title,
                });
              })
              .catch((err: unknown) => {
                logError('usePlcSoftDelete.undo', err, { plcId, type, id });
                addToast(
                  t('plcDashboard.trash.restoreFailed', {
                    defaultValue: "Couldn't restore that item.",
                  }),
                  'error'
                );
              });
          },
        }
      );
    },
    [plcId, user, addToast, t]
  );

  return useMemo(() => ({ softDelete }), [softDelete]);
}
