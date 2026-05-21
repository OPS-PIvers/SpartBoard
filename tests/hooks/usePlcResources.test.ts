import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { usePlcResources } from '@/hooks/usePlcResources';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(
    (field: string, op: string, val: unknown) =>
      `where:${field}:${op}:${String(val)}`
  ),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

const useAuthMock =
  vi.fn<() => { user: { uid: string; email: string | null } | null }>();
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
const mockWhere = where as Mock;

const ADMIN_UID = 'admin-1';
const ADMIN_EMAIL = 'admin@school.edu';
const PLC_ID = 'plc-abc';

const makeResource = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'doc',
  title: `Resource ${id}`,
  description: '',
  refId: 'https://docs.google.com/d/xyz',
  scope: 'all',
  plcIds: [],
  createdByAdminUid: ADMIN_UID,
  createdByAdminEmail: ADMIN_EMAIL,
  createdAt: 1000,
  updatedAt: 2000,
  ...extra,
});

const makeFakeSnap = (
  docs: Array<{ id: string; data: Record<string, unknown> }>
) => ({
  forEach: (
    fn: (d: { id: string; data: () => Record<string, unknown> }) => void
  ) => {
    for (const d of docs) fn({ id: d.id, data: () => d.data });
  },
});

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
  useAuthMock.mockReturnValue({
    user: { uid: ADMIN_UID, email: ADMIN_EMAIL },
  });
  // Default: onSnapshot returns an unsubscribe fn
  mockOnSnapshot.mockReturnValue(() => undefined);
});

// ---------------------------------------------------------------------------
// Admin mode
// ---------------------------------------------------------------------------
describe('usePlcResources({ asAdmin: true })', () => {
  it('subscribes to the plc_resources collection', () => {
    renderHook(() => usePlcResources({ asAdmin: true }));
    expect(mockCollection).toHaveBeenCalledWith(
      expect.anything(),
      'plc_resources'
    );
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('maps snapshot docs into PlcResource[]', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcResources({ asAdmin: true }));

    act(() => {
      cb(makeFakeSnap([{ id: 'r1', data: makeResource('r1') }]));
    });

    expect(result.current.resources).toHaveLength(1);
    expect(result.current.resources[0]?.id).toBe('r1');
    expect(result.current.resources[0]?.kind).toBe('doc');
  });

  it('drops docs with invalid/missing fields', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcResources({ asAdmin: true }));

    act(() => {
      cb(
        makeFakeSnap([
          { id: 'good', data: makeResource('good') },
          { id: 'bad', data: { id: 'bad', kind: 'doc' } }, // missing required fields
        ])
      );
    });

    expect(result.current.resources).toHaveLength(1);
    expect(result.current.resources[0]?.id).toBe('good');
  });

  it('createResource stamps server fields and writes the correct shape', async () => {
    const { result } = renderHook(() => usePlcResources({ asAdmin: true }));

    await act(async () => {
      const id = await result.current.createResource({
        kind: 'doc',
        title: 'Unit Plan',
        description: 'Overview doc for unit 3',
        refId: 'https://docs.google.com/d/123',
        scope: 'all',
        plcIds: [],
      });
      expect(id).toBe('generated-id');
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const written = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.id).toBe('generated-id');
    expect(written.kind).toBe('doc');
    expect(written.title).toBe('Unit Plan');
    expect(written.createdByAdminUid).toBe(ADMIN_UID);
    expect(written.createdByAdminEmail).toBe(ADMIN_EMAIL);
    expect(typeof written.createdAt).toBe('number');
    expect(typeof written.updatedAt).toBe('number');
    expect(written.createdAt).toBe(written.updatedAt);
    // scope==='all' forces plcIds to []
    expect(written.plcIds).toEqual([]);
  });

  it('createResource sets plcIds from input when scope is "selected"', async () => {
    const { result } = renderHook(() => usePlcResources({ asAdmin: true }));

    await act(async () => {
      await result.current.createResource({
        kind: 'quiz',
        title: 'Quiz Push',
        description: '',
        refId: 'group-id-xyz',
        scope: 'selected',
        plcIds: ['plc-1', 'plc-2'],
      });
    });

    const written = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.scope).toBe('selected');
    expect(written.plcIds).toEqual(['plc-1', 'plc-2']);
  });

  it('deleteResource calls Firestore deleteDoc with the correct path', async () => {
    const { result } = renderHook(() => usePlcResources({ asAdmin: true }));

    await act(async () => {
      await result.current.deleteResource('res-99');
    });

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    // mockDoc with two segments returns them joined: 'plc_resources/res-99'
    expect(mockDeleteDoc).toHaveBeenCalledWith('plc_resources/res-99');
  });

  it('returns loading:false and empty resources when user is null', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => usePlcResources({ asAdmin: true }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.resources).toHaveLength(0);
  });

  it('sets error when the admin-mode snapshot fails', async () => {
    let errCb: (err: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, _onNext, onError) => {
      errCb = onError as (err: unknown) => void;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcResources({ asAdmin: true }));

    act(() => {
      errCb(new Error('admin-permission-denied'));
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });
    expect(result.current.error?.message).toBe('admin-permission-denied');
    expect(result.current.loading).toBe(false);
  });

  it('sorts the admin resources by createdAt descending', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcResources({ asAdmin: true }));

    // Provide docs out of chronological order — the hook must sort newest-first.
    act(() => {
      cb(
        makeFakeSnap([
          { id: 'old', data: makeResource('old', { createdAt: 1000 }) },
          { id: 'new', data: makeResource('new', { createdAt: 3000 }) },
          { id: 'mid', data: makeResource('mid', { createdAt: 2000 }) },
        ])
      );
    });

    expect(result.current.resources.map((r) => r.id)).toEqual([
      'new',
      'mid',
      'old',
    ]);
  });
});

// ---------------------------------------------------------------------------
// PLC member mode — merge/de-dupe
// ---------------------------------------------------------------------------
describe('usePlcResources({ plcId })', () => {
  it('creates two separate queries with the right where clauses', () => {
    renderHook(() => usePlcResources({ plcId: PLC_ID }));
    expect(mockWhere).toHaveBeenCalledWith('scope', '==', 'all');
    expect(mockWhere).toHaveBeenCalledWith('plcIds', 'array-contains', PLC_ID);
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
  });

  it('de-duplicates resources that appear in both queries', async () => {
    const callbacks: Array<(snap: unknown) => void> = [];
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      callbacks.push(onNext as (snap: unknown) => void);
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcResources({ plcId: PLC_ID }));

    // Query 1 (all-scope) returns resource r1
    act(() => {
      callbacks[0]?.(
        makeFakeSnap([
          {
            id: 'r1',
            data: makeResource('r1', { scope: 'all', plcIds: [] }),
          },
        ])
      );
    });
    // Query 2 (selected-scope) also returns r1 plus r2
    act(() => {
      callbacks[1]?.(
        makeFakeSnap([
          {
            id: 'r1',
            data: makeResource('r1', { scope: 'all', plcIds: [] }),
          },
          {
            id: 'r2',
            data: makeResource('r2', {
              scope: 'selected',
              plcIds: [PLC_ID],
            }),
          },
        ])
      );
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // r1 should appear only once
    const ids = result.current.resources.map((r) => r.id);
    expect(ids.filter((id) => id === 'r1')).toHaveLength(1);
    expect(ids).toContain('r2');
    expect(result.current.resources).toHaveLength(2);
  });

  it('returns loading:false and empty resources when plcId is null', async () => {
    const { result } = renderHook(() => usePlcResources({ plcId: null }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.resources).toHaveLength(0);
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('does not expose mutator functions in PLC mode', () => {
    const { result } = renderHook(() => usePlcResources({ plcId: PLC_ID }));
    expect('createResource' in result.current).toBe(false);
  });

  it('sets error when a PLC-mode snapshot fails', async () => {
    const errCallbacks: Array<(err: unknown) => void> = [];
    mockOnSnapshot.mockImplementation((_q, _onNext, onError) => {
      errCallbacks.push(onError as (err: unknown) => void);
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcResources({ plcId: PLC_ID }));

    act(() => {
      errCallbacks[0]?.(new Error('permission-denied'));
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });
    expect(result.current.error?.message).toBe('permission-denied');
  });

  it('clears a prior error when a PLC-mode snapshot recovers', async () => {
    const nextCallbacks: Array<(snap: unknown) => void> = [];
    const errCallbacks: Array<(err: unknown) => void> = [];
    mockOnSnapshot.mockImplementation((_q, onNext, onError) => {
      nextCallbacks.push(onNext as (snap: unknown) => void);
      errCallbacks.push(onError as (err: unknown) => void);
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcResources({ plcId: PLC_ID }));

    // First, the all-scope query fails.
    act(() => {
      errCallbacks[0]?.(new Error('transient'));
    });
    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    // Then a successful snapshot arrives on the same query — error must clear.
    act(() => {
      nextCallbacks[0]?.(
        makeFakeSnap([
          { id: 'r1', data: makeResource('r1', { scope: 'all', plcIds: [] }) },
        ])
      );
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
    expect(result.current.resources).toHaveLength(1);
  });
});
