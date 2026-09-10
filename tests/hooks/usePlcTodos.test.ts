import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { usePlcTodos } from '@/hooks/usePlcTodos';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, dir: 'asc' | 'desc') => ({
    __orderBy: { field, dir },
  })),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  writeBatch: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

const useAuthMock = vi.fn<() => { user: { uid: string } | null }>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockOrderBy = orderBy as Mock;
const mockWriteBatch = writeBatch as Mock;

const USER_UID = 'user-1';
const PLC_ID = 'plc-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockDoc.mockImplementation((_collectionRef: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  useAuthMock.mockReturnValue({ user: { uid: USER_UID } });
});

describe('usePlcTodos — listener wiring', () => {
  it('orders by createdAt asc', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    renderHook(() => usePlcTodos(PLC_ID));
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'asc');
  });
});

describe('usePlcTodos — live filtering', () => {
  const fakeSnap = (
    docs: Array<{ id: string; data: Record<string, unknown> }>
  ) => ({
    forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
      for (const d of docs) fn({ id: d.id, data: () => d.data });
    },
  });

  it('drops soft-deleted todos, preserving server order', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcTodos(PLC_ID));

    act(() => {
      cb(
        fakeSnap([
          {
            id: 'a',
            data: { text: 'A', done: true, createdBy: 'u', createdAt: 1 },
          },
          {
            id: 'b',
            data: {
              text: 'B',
              done: false,
              createdBy: 'u',
              createdAt: 2,
              deletedAt: 3,
            },
          },
          {
            id: 'c',
            data: { text: 'C', done: false, createdBy: 'u', createdAt: 3 },
          },
        ])
      );
    });

    const ids = result.current.todos.map((t) => t.id);
    expect(ids).toEqual(['a', 'c']);
  });

  it('tolerates a Timestamp createdAt (serverTimestamp on read) via tsToMillis', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcTodos(PLC_ID));

    act(() => {
      cb({
        forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
          fn({
            id: 'ts',
            data: () => ({
              text: 'Stamped',
              done: false,
              createdBy: 'u',
              createdAt: { toMillis: () => 1700000000000 },
            }),
          });
        },
      });
    });

    expect(result.current.todos).toHaveLength(1);
    expect(result.current.todos[0]?.createdAt).toBe(1700000000000);
  });
});

describe('usePlcTodos — archiveTodos', () => {
  it('batches deletedAt tombstone writes for the given ids', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });

    const { result } = renderHook(() => usePlcTodos(PLC_ID));

    await act(async () => {
      await result.current.archiveTodos(['t1', 't2']);
    });

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(batchUpdate).toHaveBeenCalledTimes(2);
    expect(batchCommit).toHaveBeenCalledTimes(1);
    const [path, patch] = batchUpdate.mock.calls[0] ?? [];
    expect(path).toBe(`plcs/${PLC_ID}/todos/t1`);
    expect(patch).toHaveProperty('deletedAt');
  });

  it('chunks archive writes across multiple batches over the 400-id limit', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });

    const { result } = renderHook(() => usePlcTodos(PLC_ID));
    const ids = Array.from({ length: 401 }, (_, i) => `t${i}`);

    await act(async () => {
      await result.current.archiveTodos(ids);
    });

    expect(mockWriteBatch).toHaveBeenCalledTimes(2);
    expect(batchCommit).toHaveBeenCalledTimes(2);
  });
});
