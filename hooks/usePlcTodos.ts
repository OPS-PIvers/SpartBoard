import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcTodo } from '@/types';
import { logError } from '@/utils/logError';

const PLCS_COLLECTION = 'plcs';
const TODOS_SUBCOLLECTION = 'todos';

interface UsePlcTodosResult {
  todos: PlcTodo[];
  loading: boolean;
  createTodo: (text: string) => Promise<string>;
  toggleDone: (todoId: string, done: boolean) => Promise<void>;
  updateText: (todoId: string, text: string) => Promise<void>;
  deleteTodo: (todoId: string) => Promise<void>;
}

function parseTodo(id: string, data: Record<string, unknown>): PlcTodo | null {
  if (
    typeof data.text !== 'string' ||
    typeof data.done !== 'boolean' ||
    typeof data.createdBy !== 'string' ||
    typeof data.createdAt !== 'number'
  ) {
    return null;
  }
  return {
    id,
    text: data.text,
    done: data.done,
    createdBy: data.createdBy,
    createdAt: data.createdAt,
  };
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
  const [todos, setTodos] = useState<PlcTodo[]>([]);
  const [loading, setLoading] = useState(true);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setTodos([]);
    setLoading(true);
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
          if (parsed) list.push(parsed);
        });
        // Incomplete first, then completed — within each group preserve
        // server order (insertion order).
        list.sort((a, b) => {
          if (a.done === b.done) return 0;
          return a.done ? 1 : -1;
        });
        setTodos(list);
        setLoading(false);
      },
      (err) => {
        logError('usePlcTodos.snapshot', err, { plcId });
        setLoading(false);
      }
    );
    return () => unsub();
  }, [plcId, user]);

  const createTodo = useCallback(
    async (text: string): Promise<string> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const trimmed = text.trim();
      if (!trimmed) throw new Error('Todo text required');
      const ref = doc(
        collection(db, PLCS_COLLECTION, plcId, TODOS_SUBCOLLECTION)
      );
      const todo: PlcTodo = {
        id: ref.id,
        text: trimmed,
        done: false,
        createdBy: user.uid,
        createdAt: Date.now(),
      };
      await setDoc(ref, todo);
      return ref.id;
    },
    [plcId, user]
  );

  const toggleDone = useCallback(
    async (todoId: string, done: boolean): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const existing = todos.find((t) => t.id === todoId);
      if (!existing) throw new Error('Todo not found');
      await setDoc(
        doc(db, PLCS_COLLECTION, plcId, TODOS_SUBCOLLECTION, todoId),
        { ...existing, done }
      );
    },
    [plcId, user, todos]
  );

  const updateText = useCallback(
    async (todoId: string, text: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const trimmed = text.trim();
      if (!trimmed) throw new Error('Todo text required');
      const existing = todos.find((t) => t.id === todoId);
      if (!existing) throw new Error('Todo not found');
      await setDoc(
        doc(db, PLCS_COLLECTION, plcId, TODOS_SUBCOLLECTION, todoId),
        { ...existing, text: trimmed }
      );
    },
    [plcId, user, todos]
  );

  const deleteTodo = useCallback(
    async (todoId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await deleteDoc(
        doc(db, PLCS_COLLECTION, plcId, TODOS_SUBCOLLECTION, todoId)
      );
    },
    [plcId, user]
  );

  return useMemo(
    () => ({ todos, loading, createTodo, toggleDone, updateText, deleteTodo }),
    [todos, loading, createTodo, toggleDone, updateText, deleteTodo]
  );
};
