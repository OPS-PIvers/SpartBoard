import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { usePlcDocs } from '@/hooks/usePlcDocs';

// Sentinel so create/update tests can assert serverTimestamp() (Decision 1.3).
const SERVER_TS = { __serverTimestamp: true };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, dir: 'asc' | 'desc') => ({
    __orderBy: { field, dir },
  })),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  serverTimestamp: vi.fn(() => SERVER_TS),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

const useAuthMock =
  vi.fn<() => { user: { uid: string; displayName: string | null } | null }>();
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
const USER_DISPLAY_NAME = 'Test Teacher';
const PLC_ID = 'plc-1';

beforeEach(() => {
  vi.clearAllMocks();
  // doc() with no `path` (i.e. doc(collection)) returns an object with an
  // `.id` so the create-doc helper has something to seed `id` from.
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
  useAuthMock.mockReturnValue({
    user: { uid: USER_UID, displayName: USER_DISPLAY_NAME },
  });
});

describe('usePlcDocs — listener wiring', () => {
  it('orders by createdAt desc', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    renderHook(() => usePlcDocs(PLC_ID));
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
  });

  it('skips the listener when plcId is null', () => {
    renderHook(() => usePlcDocs(null));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('returns loading:false and empty docs when plcId is null', async () => {
    const { result } = renderHook(() => usePlcDocs(null));
    // The null-branch uses setTimeout(0) inside useEffect; waitFor polls
    // until the state update lands.
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.docs).toHaveLength(0);
  });
});

describe('usePlcDocs — snapshot mapping', () => {
  it('maps snapshot docs into PlcDoc[]', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcDocs(PLC_ID));

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
            id: 'doc-a',
            data: {
              id: 'doc-a',
              title: 'Meeting Notes',
              url: 'https://docs.google.com/document/d/abc',
              createdBy: 'u1',
              createdByName: 'Alice',
              createdAt: 1000,
              updatedAt: 2000,
            },
          },
        ])
      );
    });

    expect(result.current.docs).toHaveLength(1);
    expect(result.current.docs[0]?.id).toBe('doc-a');
    expect(result.current.docs[0]?.title).toBe('Meeting Notes');
    expect(result.current.docs[0]?.createdByName).toBe('Alice');
  });

  it('drops docs missing required fields', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcDocs(PLC_ID));

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
            id: 'good',
            data: {
              id: 'good',
              title: 'Valid',
              url: 'https://docs.google.com/document/d/xyz',
              createdBy: 'u1',
              createdByName: 'Bob',
              createdAt: 100,
              updatedAt: 200,
            },
          },
          {
            // url missing — drop
            id: 'bad-1',
            data: {
              id: 'bad-1',
              title: 'No URL',
              createdBy: 'u1',
              createdByName: 'Bob',
              createdAt: 100,
              updatedAt: 200,
            },
          },
          {
            // createdByName missing (a required string) — drop
            id: 'bad-2',
            data: {
              id: 'bad-2',
              title: 'No author name',
              url: 'https://docs.google.com',
              createdBy: 'u1',
              createdAt: 100,
              updatedAt: 200,
            },
          },
          {
            // Timestamp-shaped time fields (serverTimestamp on read) — KEEP,
            // resolved to millis via tsToMillis.
            id: 'stamped',
            data: {
              id: 'stamped',
              title: 'Stamped',
              url: 'https://docs.google.com/document/d/stamp',
              createdBy: 'u1',
              createdByName: 'Bob',
              createdAt: { toMillis: () => 1700000000000 },
              updatedAt: { toMillis: () => 1700000000500 },
            },
          },
        ])
      );
    });

    expect(result.current.docs.map((d) => d.id).sort()).toEqual([
      'good',
      'stamped',
    ]);
    const stamped = result.current.docs.find((d) => d.id === 'stamped');
    expect(stamped?.createdAt).toBe(1700000000000);
    expect(stamped?.updatedAt).toBe(1700000000500);
  });
});

describe('usePlcDocs — createDoc', () => {
  it('writes a fully-formed doc with locked schema and returns the new id', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcDocs(PLC_ID));

    await act(async () => {
      const id = await result.current.createDoc({
        title: 'Sprint Plan',
        url: 'https://docs.google.com/document/d/123',
      });
      expect(id).toBe('generated-id');
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const written = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    // Locked schema fields
    expect(written.id).toBe('generated-id');
    expect(written.title).toBe('Sprint Plan');
    expect(written.url).toBe('https://docs.google.com/document/d/123');
    expect(written.createdBy).toBe(USER_UID);
    expect(written.createdByName).toBe(USER_DISPLAY_NAME);
    // Time fields are serverTimestamp() sentinels (Decision 1.3), not numbers.
    expect(written.createdAt).toBe(SERVER_TS);
    expect(written.updatedAt).toBe(SERVER_TS);
    // No extra keys beyond the locked schema
    const keys = Object.keys(written).sort();
    expect(keys).toEqual(
      [
        'id',
        'title',
        'url',
        'createdBy',
        'createdByName',
        'createdAt',
        'updatedAt',
      ].sort()
    );
  });

  it('stamps createdByName as empty string when user.displayName is null', async () => {
    useAuthMock.mockReturnValue({ user: { uid: USER_UID, displayName: null } });
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcDocs(PLC_ID));

    await act(async () => {
      await result.current.createDoc({
        title: 'T',
        url: 'https://docs.google.com',
      });
    });

    const written = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.createdByName).toBe('');
  });
});

describe('usePlcDocs — updateDoc', () => {
  it('patches title/url + updatedAt without touching identity fields', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcDocs(PLC_ID));

    await act(async () => {
      await result.current.updateDoc('doc-1', { title: 'New Title' });
    });

    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [path, patch] = mockUpdateDoc.mock.calls[0] ?? [];
    expect(path).toBe(`plcs/${PLC_ID}/docs/doc-1`);
    const fields = patch as Record<string, unknown>;
    expect(fields.title).toBe('New Title');
    expect(fields.url).toBeUndefined();
    expect(fields.updatedAt).toBe(SERVER_TS);
    // Must NOT touch identity/immutable fields
    expect(fields.id).toBeUndefined();
    expect(fields.createdBy).toBeUndefined();
    expect(fields.createdByName).toBeUndefined();
    expect(fields.createdAt).toBeUndefined();
  });

  it('patches url only when only url is provided', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcDocs(PLC_ID));

    await act(async () => {
      await result.current.updateDoc('doc-1', {
        url: 'https://docs.google.com/document/d/new',
      });
    });

    const fields = mockUpdateDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(fields.url).toBe('https://docs.google.com/document/d/new');
    expect(fields.title).toBeUndefined();
    expect(fields.updatedAt).toBe(SERVER_TS);
  });

  it('omits title and url when patch is empty but still stamps updatedAt', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcDocs(PLC_ID));

    await act(async () => {
      await result.current.updateDoc('doc-1', {});
    });

    const fields = mockUpdateDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(fields.title).toBeUndefined();
    expect(fields.url).toBeUndefined();
    expect(fields.updatedAt).toBe(SERVER_TS);
  });
});

describe('usePlcDocs — deleteDoc', () => {
  it('calls Firestore deleteDoc with the correct path', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcDocs(PLC_ID));

    await act(async () => {
      await result.current.deleteDoc('doc-99');
    });

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc).toHaveBeenCalledWith(`plcs/${PLC_ID}/docs/doc-99`);
  });
});
