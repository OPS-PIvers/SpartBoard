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
import { PlcTodo } from '@/types';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';
import { usePlcSubcollection } from '@/context/usePlcContext';

const PLCS_COLLECTION = 'plcs';
const TODOS_SUBCOLLECTION = 'todos';

interface UsePlcTodosResult {
  todos: PlcTodo[];
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty `todos` array
   * is "couldn't load," not "no items yet."
   */
  error: Error | null;
  createTodo: (text: string) => Promise<string>;
  toggleDone: (todoId: string, done: boolean) => Promise<void>;
  updateText: (todoId: string, text: string) => Promise<void>;
  /**
   * Soft-delete a to-do (Decision 3.1): writes a `deletedAt` tombstone rather
   * than hard-deleting, so the item drops out of the live list (the snapshot
   * filters `deletedAt != null`) but stays restorable from Trash. Restore with
   * `restoreTodo`.
   */
  deleteTodo: (todoId: string) => Promise<void>;
  /** Restore a soft-deleted to-do by clearing its `deletedAt` tombstone. */
  restoreTodo: (todoId: string) => Promise<void>;
}

export function parseTodo(
  id: string,
  data: Record<string, unknown>
): PlcTodo | null {
  if (
    typeof data.text !== 'string' ||
    typeof data.done !== 'boolean' ||
    typeof data.createdBy !== 'string'
  ) {
    return null;
  }
  // createdAt is serverTimestamp()-backed on write (Decision 1.3); legacy
  // docs carry a plain millis number. `tsToMillis` tolerates both.
  const todo: PlcTodo = {
    id,
    text: data.text,
    done: data.done,
    createdBy: data.createdBy,
    createdAt: tsToMillis(data.createdAt),
  };
  // Wave-2 fields (§3.9 / §3.10) — all optional so legacy todos parse cleanly.
  if (typeof data.assigneeUid === 'string') {
    todo.assigneeUid = data.assigneeUid;
  } else if (data.assigneeUid === null) {
    todo.assigneeUid = null;
  }
  if (typeof data.dueAt === 'number') {
    todo.dueAt = data.dueAt;
  } else if (data.dueAt === null) {
    todo.dueAt = null;
  }
  if (typeof data.meetingId === 'string') {
    todo.meetingId = data.meetingId;
  } else if (data.meetingId === null) {
    todo.meetingId = null;
  }
  // Soft-delete tombstone (Decision 3.1): resolved to millis; a live snapshot's
  // pending serverTimestamp yields 0 (treated as "not deleted yet" by filters).
  if (typeof data.deletedAt === 'number') {
    todo.deletedAt = data.deletedAt;
  } else if (data.deletedAt != null) {
    todo.deletedAt = tsToMillis(data.deletedAt);
  } else if (data.deletedAt === null) {
    todo.deletedAt = null;
  }
  return todo;
}

/**
 * Live subscription to a PLC's shared to-do list. Server-orders by
 * `createdAt` ascending; the UI sorts incomplete-first locally because
 * Firestore can't compose multiple orderBy clauses without a composite
 * index for boolean+number, and a single index pin doesn't justify the
 * Firestore deploy cost for a feature this small.
 */
export const usePlcTodos = (plcId: string | null): UsePlcTodosResult => {
  const { user } = useAuth();
  // Back-compat (Decision 1.4): read from a mounted PlcProvider when present.
  const fromProvider = usePlcSubcollection(plcId, (s) => s.todos);
  const [todos, setTodos] = useState<PlcTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setTodos([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (fromProvider) return;
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setTodos([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(db, PLCS_COLLECTION, plcId, TODOS_SUBCOLLECTION);
    const unsub = onSnapshot(
      query(ref, orderBy('createdAt', 'asc')),
      (snap) => {
        const list: PlcTodo[] = [];
        snap.forEach((d) => {
          const parsed = parseTodo(d.id, d.data() as Record<string, unknown>);
          // Soft-deleted to-dos (Decision 3.1) drop out of the live list — they
          // live in Trash until restored or GC'd. A pending serverTimestamp
          // resolves to 0 (still != null), so a just-deleted item disappears
          // immediately rather than lingering until the timestamp round-trips.
          if (parsed && parsed.deletedAt == null) list.push(parsed);
        });
        // Incomplete first, then completed — within each group preserve
        // server order (insertion order).
        list.sort((a, b) => {
          if (a.done === b.done) return 0;
          return a.done ? 1 : -1;
        });
        setTodos(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcTodos.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user, fromProvider]);

  const createTodo = useCallback(
    async (text: string): Promise<string> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const trimmed = text.trim();
      if (!trimmed) throw new Error('Todo text required');
      const ref = doc(
        collection(db, PLCS_COLLECTION, plcId, TODOS_SUBCOLLECTION)
      );
      // serverTimestamp() for createdAt (Decision 1.3); the typed
      // `PlcTodo.createdAt: number` is the read-side shape after `parseTodo`
      // resolves the Timestamp. The write payload can't be the typed `PlcTodo`.
      await setDoc(ref, {
        id: ref.id,
        text: trimmed,
        done: false,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    },
    [plcId, user]
  );

  // Patch-only updates so a teammate's concurrent edit on a different
  // field isn't reverted by a stale local copy of the todo. The rule's
  // `keys.hasOnly([...])` check applies to the post-merge doc, so a
  // partial `updateDoc` patch passes — id/createdBy/createdAt remain
  // immutable because they're untouched.
  const toggleDone = useCallback(
    async (todoId: string, done: boolean): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await updateDoc(
        doc(db, PLCS_COLLECTION, plcId, TODOS_SUBCOLLECTION, todoId),
        { done }
      );
    },
    [plcId, user]
  );

  const updateText = useCallback(
    async (todoId: string, text: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const trimmed = text.trim();
      if (!trimmed) throw new Error('Todo text required');
      await updateDoc(
        doc(db, PLCS_COLLECTION, plcId, TODOS_SUBCOLLECTION, todoId),
        { text: trimmed }
      );
    },
    [plcId, user]
  );

  // Soft-delete (Decision 3.1): write a `deletedAt` tombstone instead of
  // hard-deleting. The post-merge doc still passes the rule's
  // `keys().hasOnly([...])` (deletedAt is in the widened key set) and
  // `plcSubDeletedAtOk()`; identity/createdBy/createdAt stay untouched.
  const deleteTodo = useCallback(
    async (todoId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await updateDoc(
        doc(db, PLCS_COLLECTION, plcId, TODOS_SUBCOLLECTION, todoId),
        { deletedAt: serverTimestamp() }
      );
    },
    [plcId, user]
  );

  const restoreTodo = useCallback(
    async (todoId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await updateDoc(
        doc(db, PLCS_COLLECTION, plcId, TODOS_SUBCOLLECTION, todoId),
        { deletedAt: null }
      );
    },
    [plcId, user]
  );

  return useMemo(() => {
    const resolved = fromProvider
      ? {
          todos: fromProvider.data,
          loading: fromProvider.loading,
          error: fromProvider.error,
        }
      : { todos, loading, error };
    return {
      ...resolved,
      createTodo,
      toggleDone,
      updateText,
      deleteTodo,
      restoreTodo,
    };
  }, [
    fromProvider,
    todos,
    loading,
    error,
    createTodo,
    toggleDone,
    updateText,
    deleteTodo,
    restoreTodo,
  ]);
};
