import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcTodo } from '@/types';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';

const PLCS_COLLECTION = 'plcs';
const TODOS_SUBCOLLECTION = 'todos';

/** Max ids per `writeBatch` — Firestore's hard batch-write limit is 500. */
const ARCHIVE_BATCH_SIZE = 400;

interface UsePlcTodosResult {
  /** Live (non-soft-deleted) legacy to-dos, oldest first. */
  todos: PlcTodo[];
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty `todos` array
   * is "couldn't load," not "no items yet."
   */
  error: Error | null;
  /**
   * Soft-delete (archive) the given legacy to-dos (Decision 3.1): writes a
   * `deletedAt` tombstone to each in batches of `ARCHIVE_BATCH_SIZE`. Legacy
   * to-dos are read-only otherwise (§7.4) — imported into note action items.
   */
  archiveTodos: (ids: string[]) => Promise<void>;
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
 * @deprecated Legacy. Read-only live subscription to a PLC's legacy to-do
 * list (§7.4) — the source of truth for open action items is now note
 * `actionItems`; see `utils/plcActionItems.ts`. Exposes `archiveTodos` to
 * soft-delete legacy to-dos once they've been imported into a note.
 */
export const usePlcTodos = (plcId: string | null): UsePlcTodosResult => {
  const { user } = useAuth();
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
          if (parsed && parsed.deletedAt == null) list.push(parsed);
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
  }, [plcId, user]);

  const archiveTodos = useCallback(
    async (ids: string[]): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      for (let i = 0; i < ids.length; i += ARCHIVE_BATCH_SIZE) {
        const chunk = ids.slice(i, i + ARCHIVE_BATCH_SIZE);
        const batch = writeBatch(db);
        for (const id of chunk) {
          batch.update(
            doc(db, PLCS_COLLECTION, plcId, TODOS_SUBCOLLECTION, id),
            { deletedAt: Date.now() }
          );
        }
        await batch.commit();
      }
    },
    [plcId, user]
  );

  return { todos, loading, error, archiveTodos };
};
