import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { usePlcTodos } from '@/hooks/usePlcTodos';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, dir: 'asc' | 'desc') => ({
    __orderBy: { field, dir },
  })),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
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
const mockSetDoc = setDoc as Mock;
const mockUpdateDoc = updateDoc as Mock;
const mockDeleteDoc = deleteDoc as Mock;
const mockOrderBy = orderBy as Mock;

const USER_UID = 'user-1';
const PLC_ID = 'plc-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockDoc.mockImplementation((collectionRef: unknown, ...segs: string[]) => {
    if (segs.length === 0) {
      return { id: 'generated-id', __collection: collectionRef };
    }
    return segs.join('/');
  });
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  useAuthMock.mockReturnValue({ user: { uid: USER_UID } });
});

describe('usePlcTodos — listener wiring', () => {
  it('orders by createdAt asc (UI sorts incomplete-first locally)', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    renderHook(() => usePlcTodos(PLC_ID));
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'asc');
  });
});

describe('usePlcTodos — sort: incomplete first then complete', () => {
  it('local sort puts done todos at the bottom', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcTodos(PLC_ID));

    const fakeSnap = (
      docs: Array<{ id: string; data: Record<string, unknown> }>
    ) => ({
      forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
        for (const d of docs) fn({ id: d.id, data: () => d.data });
      },
    });

    act(() => {
      cb(
        fakeSnap([
          {
            id: 'a',
            data: { text: 'A', done: true, createdBy: 'u', createdAt: 1 },
          },
          {
            id: 'b',
            data: { text: 'B', done: false, createdBy: 'u', createdAt: 2 },
          },
          {
            id: 'c',
            data: { text: 'C', done: false, createdBy: 'u', createdAt: 3 },
          },
        ])
      );
    });

    const ids = result.current.todos.map((t) => t.id);
    // Incomplete (b, c) before complete (a). Within each group, server
    // order (createdAt asc) is preserved.
    expect(ids).toEqual(['b', 'c', 'a']);
  });
});

describe('usePlcTodos — createTodo', () => {
  it('rejects empty/whitespace-only text without writing', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcTodos(PLC_ID));

    await act(async () => {
      await expect(result.current.createTodo('   ')).rejects.toThrow();
    });

    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('writes a trimmed-text todo stamped with createdBy', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcTodos(PLC_ID));

    await act(async () => {
      await result.current.createTodo('  meet on Tuesday  ');
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const written = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.text).toBe('meet on Tuesday');
    expect(written.done).toBe(false);
    expect(written.createdBy).toBe(USER_UID);
  });
});

// updateDoc patches — verify only the changed field travels in the wire
// payload. The previous setDoc-based implementation rewrote the full doc
// from local state, which could revert a teammate's concurrent edit on
// the *other* field. These tests pin the patch-only contract.
describe('usePlcTodos — patch-only updates', () => {
  it('toggleDone sends only { done } via updateDoc (no full-doc rewrite)', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcTodos(PLC_ID));

    await act(async () => {
      await result.current.toggleDone('todo-1', true);
    });

    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [path, patch] = mockUpdateDoc.mock.calls[0] ?? [];
    expect(path).toBe(`plcs/${PLC_ID}/todos/todo-1`);
    expect(patch).toEqual({ done: true });
  });

  it('updateText sends only { text } trimmed via updateDoc', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcTodos(PLC_ID));

    await act(async () => {
      await result.current.updateText('todo-1', '  call parents  ');
    });

    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [path, patch] = mockUpdateDoc.mock.calls[0] ?? [];
    expect(path).toBe(`plcs/${PLC_ID}/todos/todo-1`);
    expect(patch).toEqual({ text: 'call parents' });
  });
});
