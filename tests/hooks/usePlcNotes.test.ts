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
import { usePlcNotes } from '@/hooks/usePlcNotes';

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
  // doc() with no `path` (i.e. doc(collection)) returns an object with an
  // `.id` so the create-note helper has something to seed `id` from.
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

describe('usePlcNotes — listener wiring', () => {
  it('orders by lastEditedAt desc', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    renderHook(() => usePlcNotes(PLC_ID));
    expect(mockOrderBy).toHaveBeenCalledWith('lastEditedAt', 'desc');
  });

  it('skips the listener when plcId is null', () => {
    renderHook(() => usePlcNotes(null));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});

describe('usePlcNotes — defensive parse', () => {
  it('drops notes missing required string/number fields', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

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
            data: {
              title: 'Valid',
              body: 'body',
              createdBy: 'u1',
              createdAt: 1,
              lastEditedBy: 'u1',
              lastEditedAt: 2,
            },
          },
          {
            // body missing — drop
            id: 'b',
            data: {
              title: 'No body',
              createdBy: 'u1',
              createdAt: 1,
              lastEditedBy: 'u1',
              lastEditedAt: 2,
            },
          },
          {
            // lastEditedAt not a number — drop
            id: 'c',
            data: {
              title: 'Bad',
              body: 'b',
              createdBy: 'u1',
              createdAt: 1,
              lastEditedBy: 'u1',
              lastEditedAt: 'recent',
            },
          },
        ])
      );
    });

    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0]?.id).toBe('a');
  });
});

describe('usePlcNotes — createNote', () => {
  it('writes a fully-formed note with createdBy + lastEditedBy stamped to the current user', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

    await act(async () => {
      const id = await result.current.createNote({
        title: 'T',
        body: 'B',
      });
      expect(id).toBe('generated-id');
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const written = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.title).toBe('T');
    expect(written.body).toBe('B');
    expect(written.createdBy).toBe(USER_UID);
    expect(written.lastEditedBy).toBe(USER_UID);
    expect(typeof written.createdAt).toBe('number');
    expect(typeof written.lastEditedAt).toBe('number');
  });
});

// updateDoc patches — verify only the changed field travels in the wire
// payload (plus the always-stamped lastEditedBy / lastEditedAt). The
// previous setDoc-based implementation rewrote the full doc from local
// state, which could revert a teammate's concurrent edit on the *other*
// field.
describe('usePlcNotes — patch-only updateNote', () => {
  it('sends only the patched field plus lastEditedBy/At via updateDoc', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

    await act(async () => {
      await result.current.updateNote('note-1', { body: 'new body' });
    });

    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [path, patch] = mockUpdateDoc.mock.calls[0] ?? [];
    expect(path).toBe(`plcs/${PLC_ID}/notes/note-1`);
    const fields = patch as Record<string, unknown>;
    // Only `body` is patched, plus the rule-required `lastEditedBy` and
    // `lastEditedAt`. `title` must NOT appear — that's the whole point
    // of the patch-only contract (a teammate's concurrent title edit
    // would otherwise be reverted by stale local state).
    expect(fields.body).toBe('new body');
    expect(fields.title).toBeUndefined();
    expect(fields.lastEditedBy).toBe(USER_UID);
    expect(typeof fields.lastEditedAt).toBe('number');
  });

  it('omits both title and body when patch contains neither (still stamps lastEditedBy)', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcNotes(PLC_ID));

    await act(async () => {
      await result.current.updateNote('note-1', {});
    });

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const fields = mockUpdateDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(fields.title).toBeUndefined();
    expect(fields.body).toBeUndefined();
    expect(fields.lastEditedBy).toBe(USER_UID);
  });
});
